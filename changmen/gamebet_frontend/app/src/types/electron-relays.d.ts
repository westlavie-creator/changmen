export {};

type RelayStatus = {
  platform: string;
  upstreamConnected: boolean;
  messagesReceived?: number;
  messagesPublished?: number;
  lastError?: string | null;
  lastUpstreamAt?: number | null;
  forwardedTopics?: number;
};

type SimpleRelayApi = {
  start: (arg?: string) => Promise<RelayStatus>;
  stop: () => Promise<RelayStatus>;
  status: () => Promise<RelayStatus>;
  onMessage: (callback: (payload: unknown) => void) => () => void;
};

declare global {
  interface Window {
    gamebetRelays?: {
      ray: SimpleRelayApi;
      ob: {
        start: () => Promise<RelayStatus>;
        stop: () => Promise<RelayStatus>;
        status: () => Promise<RelayStatus>;
        subscribe: (topic: string) => Promise<RelayStatus>;
        unsubscribe: (topic: string) => Promise<RelayStatus>;
        publish: (topic: string, payload: string) => Promise<boolean>;
        onMessage: (callback: (message: { topic: string; payload: string }) => void) => () => void;
      };
      tf?: SimpleRelayApi | null;
      ia?: SimpleRelayApi | null;
    };
  }
}
