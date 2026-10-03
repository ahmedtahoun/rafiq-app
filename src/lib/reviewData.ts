/**
 * Members' reviews of a coach (SUPABASE-MIGRATION-PLAN.md step 6), for the
 * coach's page and Discover: the `coach_reviews` view (0005), which shows
 * only ratings with a comment, signed with the reviewer's first name and
 * last initial (`reviewer_name`).
 *
 * Never join back to profiles.full_name or clients.full_name for a name:
 * a reviewer's full name must not be public.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export type ReviewErrorCode = 'not_configured' | 'unknown';
export type ReviewResult<T> = { ok: true; data: T } | { ok: false; code: ReviewErrorCode; message: string };

const NOT_CONFIGURED = { ok: false, code: 'not_configured', message: 'Supabase credentials are missing — see .env.local.example.' } as const;
const unknown = (error: { message: string }) => ({ ok: false, code: 'unknown', message: error.message }) as const;

/** How many reviews the coach's page shows. */
export const COACH_PAGE_REVIEWS = 5;

export interface CoachReview {
  id: string;
  coachId: string;
  rating: number;
  comment: string;
  /** A real instant (ISO): show it with fmt.instantDate. */
  createdAt: string;
  /** First name and last initial, e.g. "Hana M.". */
  reviewerName: string;
  avatarBg: string;
}

const COLUMNS = 'id, coach_id, rating, comment, created_at, reviewer_name, avatar_bg';

interface ReviewRow {
  id: string | null;
  coach_id: string | null;
  rating: number | null;
  comment: string | null;
  created_at: string | null;
  reviewer_name: string | null;
  avatar_bg: string | null;
}

function toReviews(rows: ReviewRow[]): CoachReview[] {
  return rows.flatMap((r) =>
    r.id && r.coach_id && r.rating && r.comment?.trim() && r.created_at
      ? [{
          id: r.id,
          coachId: r.coach_id,
          rating: r.rating,
          comment: r.comment.trim(),
          createdAt: r.created_at,
          reviewerName: r.reviewer_name?.trim() ?? '',
          avatarBg: r.avatar_bg ?? '#7A7166',
        }]
      : [],
  );
}

/** One coach's newest reviews. */
export async function fetchCoachReviews(coachId: string, limit = COACH_PAGE_REVIEWS): Promise<ReviewResult<CoachReview[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase()
    .from('coach_reviews')
    .select(COLUMNS)
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return unknown(error);
  return { ok: true, data: toReviews(data as ReviewRow[]) };
}

/** The newest reviews across every coach, for Discover. */
export async function fetchRecentReviews(limit: number): Promise<ReviewResult<CoachReview[]>> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const { data, error } = await getSupabase()
    .from('coach_reviews')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return unknown(error);
  return { ok: true, data: toReviews(data as ReviewRow[]) };
}
