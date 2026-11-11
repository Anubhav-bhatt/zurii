/**
 * What a visitor reads when a failed response carries no message of its own
 * (a proxy's error page, an empty 502). Plain words, never a status code.
 */
export function fallbackMessage(status) {
  if (status === 503 || status === 502 || status === 504) return 'This is temporarily unavailable. Please try again in a moment.';
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  if (status === 404) return 'We could not find that.';
  if (status === 429) return 'Too many requests just now. Please wait a moment and try again.';
  return 'That did not work. Please try again.';
}
