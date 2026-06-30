import type ja from "../messages/ja.json";

type Messages = typeof ja;

declare global {
  interface IntlMessages extends Messages {}
}

export type { Messages };
