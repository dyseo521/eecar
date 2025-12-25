/**
 * Convert a date string to a relative time format in Korean
 * Examples: "방금 전", "5분 전", "3시간 전", "7일 전"
 */
export function getRelativeTime(dateString: string | undefined): string {
  if (!dateString) return '';

  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();

  // Handle future dates or invalid dates
  if (diffMs < 0 || isNaN(diffMs)) {
    return date.toLocaleDateString('ko-KR');
  }

  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 30) return `${diffDay}일 전`;

  return date.toLocaleDateString('ko-KR');
}
