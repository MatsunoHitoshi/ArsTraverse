import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/ja";

// プラグインとロケールを設定
dayjs.extend(relativeTime);
dayjs.locale("ja");

export const formatDate = (datetime: Date | string) => {
  const date = dayjs(datetime);
  const now = dayjs();

  // 現在の年と同じ場合は年を省略
  if (date.year() === now.year()) {
    return date.format("MM/DD HH:mm");
  }

  return date.format("YYYY/MM/DD HH:mm");
};

export const formatRelativeTime = (datetime: Date | string) => {
  const date = dayjs(datetime);
  const now = dayjs();

  // 48時間（2日）前より古い場合は絶対時間で表示
  const diffInHours = now.diff(date, "hour");
  if (diffInHours >= 48) {
    return formatDate(datetime);
  }

  // 相対時間で表示
  return date.fromNow();
};
