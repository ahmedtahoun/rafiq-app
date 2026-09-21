-- Profile photo storage.
--
-- 0001's profiles.avatar_photo_url and coach_profiles.cover_photo_url are
-- columns with nothing behind them — mockStore seeds both empty precisely
-- because the prototype's demo blob URLs don't resolve anywhere real. These
-- are the buckets that make them mean something.
--
-- Both buckets are PRIVATE, and that is a choice worth knowing about. A public
-- bucket is served straight off the CDN with no auth, which would put every
-- coach's photo on the open internet while 0001 deliberately grants `anon`
-- nothing and keeps Discover behind sign-in. Private keeps those two
-- consistent; the cost is that the client fetches through createSignedUrl()
-- rather than a plain public URL. Flip `public` to true here if the
-- marketplace is ever meant to be browsable logged-out — but flip Discover's
-- policies with it, not on their own.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false),
       ('covers',  'covers',  false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Path convention: <profile_id>/<filename>, e.g.
--   avatars/3f2a.../avatar.jpg
--
-- The first folder segment IS the owner check. storage.foldername() drops the
-- filename and returns the path parts, so [1] is that segment — a caller can
-- only ever write inside the folder named for their own uid, whatever they
-- call the file.
-- ---------------------------------------------------------------------------

create policy "avatars are readable by signed-in users"
  on storage.objects for select to authenticated
  using (bucket_id in ('avatars', 'covers'));

create policy "a user writes only their own photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('avatars', 'covers')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "a user replaces only their own photos"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('avatars', 'covers')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('avatars', 'covers')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "a user deletes only their own photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('avatars', 'covers')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
