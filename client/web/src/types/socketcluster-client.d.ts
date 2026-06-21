declare module "socketcluster-client" {
  export interface SocketClusterClientOptions {
    hostname?: string;
    protocolVersion?: number;
    secure?: boolean;
    port?: number;
    path?: string;
    autoConnect?: boolean;
    ackTimeout?: number;
    [key: string]: unknown;
  }

  export type SocketClusterChannel = AsyncIterable<unknown> & {
    listener(eventName: string): {
      once(): Promise<unknown>;
    };
  };

  export interface SocketClusterClient {
    subscribe(channelName: string): SocketClusterChannel;
    disconnect(): void;
  }

  const socketClusterClient: {
    create(options: SocketClusterClientOptions): SocketClusterClient;
  };

  export default socketClusterClient;
}
