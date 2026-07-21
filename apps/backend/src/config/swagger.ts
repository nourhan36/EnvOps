import swaggerJsdoc from "swagger-jsdoc";

const options = {
    definition: {
        openapi: "3.0.0",

        info: {
            title: "EnvOps AI API",
            version: "1.0.0",
            description:
                "API documentation for EnvOps AI Sandbox Platform"
        },

        servers: [
            {
                url: "http://localhost:3000"
            }
        ]
    },

    apis: [
        "./src/routes/*.ts"
    ]
};

export const swaggerSpec = swaggerJsdoc(options);