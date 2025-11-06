import type {
  MoviePayload,
  SeriesPayload,
  CategoryPayload,
  HistoryEntryPayload,
  UserPayload
} from '../validation/schemas.js';

export type Movie = MoviePayload;
export type Series = SeriesPayload;
export type Category = CategoryPayload;
export type HistoryEntry = HistoryEntryPayload;
export type UserRecord = UserPayload;

export interface SeriesFile extends SeriesPayload {}
