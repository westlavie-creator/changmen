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

declare global {
  interface Window {
    gamebetRelays?: {
      ray: {
        start: () => Promise<RelayStatus>;
        stop: () => Promise<RelayStatus>;
        status: () => Promise<RelayStatus>;
        onMessage: (callback: (payload: unknown) => void) => () => void;
      };
      ob: {
        start: () => Promise<RelayStatus>;
        stop: () => Promise<RelayStatus>;
        status: () => Promise<RelayStatus>;
        subscribe: (topic: string) => Promise<RelayStatus>;
        unsubscribe: (topic: string) => Promise<RelayStatus>;
        publish: (topic: string, payload: string) => Promise<boolean>;
        onMessage: (callback: (message: { topic: string; payload: string }) => void) => () => void;
      };
    };
  }
}
