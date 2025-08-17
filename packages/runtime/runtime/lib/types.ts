/**
 * Currency type representing a monetary value with currency symbol
 */
export interface Currency {
  /** The numeric value of the currency */
  value: number;
  /** The currency symbol/code (e.g., 'USD', 'EUR', '$') */
  symbol: string;
}

/**
 * Date with timezone type representing a date in a specific timezone
 */
export interface DateWithTimezone {
  /** The date object */
  date: Date;
  /** The timezone identifier (e.g., 'America/New_York', 'UTC', 'Europe/London') */
  timezone: string;
}
