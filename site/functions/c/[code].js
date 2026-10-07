// rafiqpro.com/c/<code>: a coach's public page, in English (site/coach-page.mjs).
import { respond } from '../../coach-page.mjs';

export const onRequestGet = (context) => respond(context, 'en');
