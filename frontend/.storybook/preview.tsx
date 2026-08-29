import type { Preview } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import "../src/index.css";

const preview: Preview = {
  parameters: {
    layout: "padded",
    controls: { expanded: true },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="dark min-h-[200px] rounded-lg bg-stellar-dark p-4 text-stellar-text-primary">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
};

export default preview;
