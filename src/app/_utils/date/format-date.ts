import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ja";
import "dayjs/locale/en";

import type { Locale } from "i18n/routing";

dayjs.extend(relativeTime);

export const formatDate = (
  datetime: Date | string,
  locale: Locale = "ja",
) => {
  const date = dayjs(datetime).locale(locale);
  const now = dayjs().locale(locale);

  if (date.year() === now.year()) {
    return date.format("MM/DD HH:mm");
  }

  return date.format("YYYY/MM/DD HH:mm");
};

export const formatRelativeTime = (
  datetime: Date | string,
  locale: Locale = "ja",
) => {
  const date = dayjs(datetime).locale(locale);
  const now = dayjs().locale(locale);

  const diffInHours = now.diff(date, "hour");
  if (diffInHours >= 48) {
    return formatDate(datetime, locale);
  }

  return date.fromNow();
};
