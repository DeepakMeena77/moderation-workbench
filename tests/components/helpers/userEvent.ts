import base, { type Options, type UserEvent } from '@testing-library/user-event';

// user-event for the component tests, with no timer between keystrokes. The default yields to the event loop
// after every key, so typing a sentence can take seconds on a busy machine while testing nothing extra; events
// still fire in the same order. Each call makes a fresh instance, as user-event recommends.
const NO_DELAY = { delay: null } satisfies Options;

export const userEvent = {
  setup: (options: Options = {}): UserEvent => base.setup({ ...NO_DELAY, ...options }),
  click: (element: Element) => base.setup(NO_DELAY).click(element),
  type: (element: Element, text: string) => base.setup(NO_DELAY).type(element, text),
  paste: (text: string) => base.setup(NO_DELAY).paste(text),
};
