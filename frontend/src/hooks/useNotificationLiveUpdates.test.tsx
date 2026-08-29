import { render } from "@testing-library/react";
import { useNotificationStore } from "../stores/notificationStore";
import { useNotificationLiveUpdates } from "./useNotificationLiveUpdates";

const subscribeSpy = vi.fn();

vi.mock("./useWebSocketEnhanced", () => ({
  useWebSocket: (channel: string, handler: (payload: unknown) => void) => {
    subscribeSpy(channel, handler);
    return {
      send: vi.fn(),
      isConnected: true,
      isSubscribed: true,
    };
  },
}));

function TestHarness() {
  useNotificationLiveUpdates();
  return null;
}

describe("useNotificationLiveUpdates", () => {
  beforeEach(() => {
    subscribeSpy.mockClear();
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
  });

  it("subscribes to notifications channel and stores incoming events", () => {
    render(<TestHarness />);

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(subscribeSpy.mock.calls[0]?.[0]).toBe("notifications");

    const handler = subscribeSpy.mock.calls[0]?.[1] as (payload: unknown) => void;

    handler({
      type: "notification",
      data: {
        id: "live-hook-1",
        title: "Live Hook",
        message: "Received from socket",
        priority: "high",
      },
    });

    const notification = useNotificationStore
      .getState()
      .notifications.find((entry) => entry.id === "live-hook-1");
    expect(notification).toBeDefined();
    expect(notification?.priority).toBe("high");
  });
});
