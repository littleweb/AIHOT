import datetime, hashlib, json, pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from publish import blob, changed_files
from research import due, TZ

class ContinuousServiceTests(unittest.TestCase):
    def test_git_object_hash_matches_git_framing(self):
        self.assertEqual(blob(b'hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a')

    def test_no_change_does_not_publish_and_local_new_content_can_publish(self):
        old = blob(b'old'); new = b'new'
        self.assertEqual(changed_files({'site/editions/today.json': b'old'}, {'site/editions/today.json': old}, {}), {})
        self.assertEqual(changed_files({'site/editions/today.json': new}, {'site/editions/today.json': old}, {'site/editions/today.json': old}), {'site/editions/today.json': new})

    def test_independent_remote_edit_is_not_overwritten(self):
        with self.assertRaisesRegex(RuntimeError, 'independently'):
            changed_files({'site/editions/today.json': b'local'}, {'site/editions/today.json': blob(b'remote')}, {'site/editions/today.json': blob(b'base')})

    def test_morning_check_runs_even_when_previous_hour_check_was_recent(self):
        now = datetime.datetime(2026, 10, 23, 5, 30, tzinfo=TZ).timestamp()
        self.assertTrue(due({'lastFinishedAt': now-60, 'morningDate': '2026-10-22'}, now))
        self.assertFalse(due({'lastFinishedAt': now-60, 'morningDate': '2026-10-23'}, now))
        self.assertTrue(due({'lastFinishedAt': now-3700, 'morningDate': '2026-10-23'}, now))


class HotPublicationTests(unittest.TestCase):
    def test_snapshot_reads_visible_heat_without_treating_clock_changes_as_new_content(self):
        from unittest.mock import patch
        import publish
        entry={'rank':1,'story':{'publicId':'checked','title':'Event'},'participantCount':2,
               'heat':10.5,'trend':'down','trendPct':-0.1,'badges':[],'spark':[11,10.5],'latest':'Checked report'}
        with patch.object(publish,'get',side_effect=[
            json.dumps({'computedAt':'2026-10-22T09:00:00Z','entries':[entry]}),
            json.dumps({'computedAt':'2026-10-22T09:05:00Z','entries':[entry]})]) as get:
            first=publish.hot_snapshot()
            self.assertEqual(first,publish.hot_snapshot())
            self.assertEqual(first[0]['heat'],10.5)
            self.assertEqual(first[0]['story'],'/story/checked')
            get.assert_called_with(publish.CONFIG['localUrl']+'/api/site/hot')

    def test_heat_change_republishes_when_rank_and_participant_count_are_unchanged(self):
        from unittest.mock import patch
        import publish
        old={'rank':1,'title':'Event','story':'/story/checked','participants':2,'heat':10.5}
        new={**old,'heat':10.1}
        state={'remote':{},'pending':None,'hot':[old]}
        with patch.object(publish,'hot_snapshot',return_value=[new]), patch.object(publish,'head_tree',return_value=('head','tree',{})), patch.object(publish,'write_json'), patch.object(publish,'finish_pending') as finish, patch.object(publish,'api') as api:
            publish.sync_hot(state)
            api.assert_called_once_with('POST',publish.REPO+'/actions/workflows/publish.yml/dispatches',{'ref':'main'})
            self.assertEqual(state['pending']['files'],{})
            self.assertEqual(state['pending']['hot'],[new])
            finish.assert_called_once_with(state)

    def test_initial_and_unchanged_hot_lists_do_not_trigger_republication(self):
        from unittest.mock import patch
        import publish
        hot=[{'rank':1,'title':'Event','story':'/story/checked','participants':2}]
        with patch.object(publish,'hot_snapshot',return_value=hot), patch.object(publish,'write_json'), patch.object(publish,'api') as api:
            state={'remote':{},'pending':None}
            publish.sync_hot(state)
            self.assertEqual(state['hot'],hot)
            publish.sync_hot(state)
            api.assert_not_called()

    def test_expired_event_republishes_the_same_public_source_without_fake_content_commit(self):
        from unittest.mock import patch
        import publish
        state={'remote':{},'pending':None,'hot':[{'rank':1,'title':'Expired','story':'/story/expired','participants':2}]}
        with patch.object(publish,'hot_snapshot',return_value=[]), patch.object(publish,'head_tree',return_value=('head','tree',{})), patch.object(publish,'write_json'), patch.object(publish,'finish_pending') as finish, patch.object(publish,'api') as api:
            publish.sync_hot(state)
            api.assert_called_once_with('POST',publish.REPO+'/actions/workflows/publish.yml/dispatches',{'ref':'main'})
            self.assertEqual(state['pending']['files'],{})
            self.assertEqual(state['pending']['hot'],[])
            finish.assert_called_once_with(state)

if __name__ == '__main__': unittest.main()
