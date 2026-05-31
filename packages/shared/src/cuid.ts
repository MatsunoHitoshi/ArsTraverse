import { createId as createIdOriginal } from "@paralleldrive/cuid2";

export const createId = () => {
  return createIdOriginal();
};
