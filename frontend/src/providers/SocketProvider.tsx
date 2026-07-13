import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  connect: (sandboxId?: string) => void;
  disconnect: () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocket(null);
    setIsConnected(false);
  }, []);

  const connect = useCallback(
    (sandboxId?: string) => {
      disconnect();

      const instance = io(SOCKET_URL, {
        transports: ['websocket'],
        autoConnect: true,
        query: sandboxId ? { sandboxId } : undefined,
      });

      instance.on('connect', () => setIsConnected(true));
      instance.on('disconnect', () => setIsConnected(false));

      socketRef.current = instance;
      setSocket(instance);
    },
    [disconnect],
  );

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const value = useMemo(
    () => ({ socket, isConnected, connect, disconnect }),
    [socket, isConnected, connect, disconnect],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
