import type { SecurityMode } from '../services/orchestrator.service';

/**
 * Server-controlled allowlist of well-known runtime images that may be
 * provisioned from a free-text prompt with a relaxed (root) security context.
 *
 * Everything here is curated: the image is official/trusted and the command is
 * pinned so the container actually does useful work (start a database, etc.)
 * instead of the hardened "sleep infinity" default. Images that are NOT on this
 * list are always provisioned hardened, so a prompt can never escalate to root
 * on an arbitrary image.
 */
export interface TrustedRuntime {
    /** Canonical repository name (tag-agnostic), e.g. "postgres". */
    name: string;
    /** Additional names the LLM might use for the same image. */
    aliases: string[];
    /** Fallback tag applied when the prompt extraction omits a tag. */
    recommendedTag: string;
    /** Security mode applied to allowlisted runs (root today). */
    securityMode: Extract<SecurityMode, 'root'>;
    /** Pod command that overrides the image ENTRYPOINT. */
    command: string[];
    /** Args passed to the image entrypoint. */
    args?: string[];
    /** Pod environment variables required by the runtime entrypoint. */
    env?: { name: string; value: string }[];
}

export const TRUSTED_RUNTIMES: TrustedRuntime[] = [
    {
        name: 'postgres',
        aliases: ['postgresql', 'postgres-db', 'psql'],
        recommendedTag: '16-alpine',
        securityMode: 'root',
        command: ['docker-entrypoint.sh'],
        args: ['postgres'],
        env: [{ name: 'POSTGRES_PASSWORD', value: 'postgres' }],
    },
    {
        name: 'mysql',
        aliases: ['mysql-db', 'mysql-server'],
        recommendedTag: '8',
        securityMode: 'root',
        command: ['docker-entrypoint.sh'],
        args: ['mysqld'],
        env: [{ name: 'MYSQL_ROOT_PASSWORD', value: 'root' }],
    },
    {
        name: 'mariadb',
        aliases: ['maria-db'],
        recommendedTag: '11',
        securityMode: 'root',
        command: ['docker-entrypoint.sh'],
        args: ['mariadbd'],
        env: [{ name: 'MARIADB_ROOT_PASSWORD', value: 'root' }],
    },
    {
        name: 'mongo',
        aliases: ['mongodb'],
        recommendedTag: '7',
        securityMode: 'root',
        command: ['docker-entrypoint.sh'],
        args: ['mongod'],
    },
    {
        name: 'redis',
        aliases: ['redis-server', 'redis-cache'],
        recommendedTag: '7-alpine',
        securityMode: 'root',
        command: ['redis-server'],
        args: ['--save', '""', '--appendonly', 'no'],
    },
];

/** Separates "registry/repo:tag@digest" into repo name, tag, and digest. */
export function parseImageRef(image: string): {
    name: string;
    tag: string | null;
    digest: string | null;
} {
    let rest = image;

    let digest: string | null = null;
    const at = rest.lastIndexOf('@');
    if (at !== -1) {
        digest = rest.slice(at + 1);
        rest = rest.slice(0, at);
    }

    let tag: string | null = null;
    const colon = rest.lastIndexOf(':');
    // A colon only separates the tag when it appears after the final "/" (i.e.
    // not part of a registry host like "localhost:5000" or a port).
    if (colon !== -1 && rest.indexOf('/') < colon) {
        tag = rest.slice(colon + 1);
        rest = rest.slice(0, colon);
    }

    // Drop the registry host so "postgres" matches "docker.io/library/postgres".
    const slash = rest.lastIndexOf('/');
    const name = rest.slice(slash + 1);

    return { name, tag, digest };
}

/**
 * Maps common-but-wrong image names to their real Docker Hub repository.
 * The LLM frequently derives the image from the user's wording ("nodejs" ->
 * "nodejs") when the actual repo is named differently ("node"). Canonicalizing
 * server-side turns those extraction errors into working sandboxes.
 */
export const IMAGE_NAME_CANONICALIZATION: Record<string, string> = {
    nodejs: 'node',
    go: 'golang',
    python3: 'python',
    mongodb: 'mongo',
    postgresql: 'postgres',
    mariadb: 'mariadb',
    dotnet: 'mcr.microsoft.com/dotnet/sdk',
};

/**
 * Rewrites the repository name portion of an image reference to its canonical
 * Docker Hub name, preserving any tag or digest. Unknown names are returned
 * unchanged. Example: "nodejs:20" -> "node:20".
 */
export function canonicalizeImageReference(image: string): string {
    const { name, tag, digest } = parseImageRef(image);
    const canonical = IMAGE_NAME_CANONICALIZATION[name.toLowerCase()];

    if (!canonical) {
        return image;
    }

    if (digest) {
        return `${canonical}@${digest}`;
    }
    return `${canonical}:${tag ?? 'latest'}`;
}

/**
 * Resolves a raw image reference against the trusted-runtime allowlist.
 * Returns null for unknown images so they stay hardened.
 */
export function resolveTrustedRuntime(
    image: string
): TrustedRuntime & { image: string } | null {
    const { name, tag, digest } = parseImageRef(image);
    const key = name.toLowerCase();
    const canonicalKey = IMAGE_NAME_CANONICALIZATION[key] ?? key;

    const runtime = TRUSTED_RUNTIMES.find(
        (r) => r.name === canonicalKey || r.aliases.includes(canonicalKey)
    );
    if (!runtime) {
        return null;
    }

    // Use the canonical repository name so aliases (e.g. "mongodb") resolve to
    // the real image repo ("mongo"). Prefer an explicit digest, then the
    // extracted tag; fall back to the recommended tag for known-good runs.
    const resolvedImage = digest
        ? `${runtime.name}@${digest}`
        : `${runtime.name}:${tag ?? runtime.recommendedTag}`;

    return { ...runtime, image: resolvedImage };
}