// rafiqpro.com/ar/c/<code>: a coach's public page, in Arabic (site/coach-page.mjs).
import { respond } from '../../../coach-page.mjs';

export const onRequestGet = (context) => respond(context, 'ar');
