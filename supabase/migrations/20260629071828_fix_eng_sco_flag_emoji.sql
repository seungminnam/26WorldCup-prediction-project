begin;

update public.teams set flag_emoji = '🏴󠁧󠁢󠁥󠁮󠁧󠁿' where id = 'ENG';
update public.teams set flag_emoji = '🏴󠁧󠁢󠁳󠁣󠁴󠁿' where id = 'SCO';

commit;
