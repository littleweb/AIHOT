import datetime, hashlib, pathlib, sys, unittest
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

if __name__ == '__main__': unittest.main()
