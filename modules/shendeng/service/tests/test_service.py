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

    def test_failed_deployment_is_replaced_by_new_content(self):
        from unittest.mock import patch
        import publish

        old_path = 'site/editions/old.json'
        new_path = 'site/editions/new.json'
        state = {'remote': {}, 'pending': {
            'commit': 'failed', 'runId': 7, 'files': {old_path: 'old'}
        }}
        files = {old_path: b'old', new_path: b'new'}
        remote = {old_path: blob(b'old')}
        with patch.object(publish, 'read_json', return_value=state), \
             patch.object(publish, 'public_files', return_value=files), \
             patch.object(publish, 'head_tree', return_value=('failed', 'tree', remote)), \
             patch.object(publish, 'api', side_effect=[
                 {'status': 'completed', 'conclusion': 'failure'},
                 {'sha': 'new-tree'}, {'sha': 'replacement'}, None
             ]), patch.object(publish, 'DATA', pathlib.Path(self.temp_directory())), \
             patch.object(publish, 'status'), patch.object(publish, 'node'), \
             patch.object(publish, 'run'), patch.object(publish, 'write_json'), \
             patch.object(publish, 'hot_snapshot', return_value=[]), \
             patch.object(publish, 'finish_pending') as finish:
            publish.sync()
            self.assertEqual(state['pending']['commit'], 'replacement')
            self.assertEqual(state['pending']['files'], {old_path: 'old', new_path: 'new'})
            finish.assert_called_once_with(state)

    def temp_directory(self):
        from tempfile import TemporaryDirectory
        return self.enterContext(TemporaryDirectory())

    def test_pending_oss_release_uses_the_latest_ranking_snapshot(self):
        from unittest.mock import patch
        import publish

        path = 'site/rankings/skills.json'
        state = {'remote': {}, 'pending': {'target': 'oss', 'commit': 'previous', 'parent': 'parent',
                                            'files': {path: 'older'}}}
        with patch.object(publish, 'read_json', return_value=state), \
             patch.object(publish, 'public_files', return_value={path: b'newer'}), \
             patch.object(publish, 'oss_options', return_value={'mode': 'active'}), \
             patch.object(publish, 'head_tree', return_value=('previous', 'tree', {path: blob(b'older')})), \
             patch.object(publish, 'api', side_effect=[{'sha': 'new-tree'}, {'sha': 'new-head'}, None]), \
             patch.object(publish, 'DATA', pathlib.Path(self.temp_directory())), \
             patch.object(publish, 'status'), patch.object(publish, 'node'), patch.object(publish, 'run'), \
             patch.object(publish, 'write_json'), patch.object(publish, 'hot_snapshot', return_value=[]), \
             patch.object(publish, 'finish_pending') as finish:
            publish.sync()
            self.assertEqual(state['pending']['files'], {path: 'newer'})
            self.assertEqual(state['pending']['commit'], 'new-head')
            finish.assert_called_once_with(state)

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
        with patch.object(publish,'oss_options',return_value={'mode':'preview'}), \
             patch.object(publish,'hot_snapshot',return_value=[new]), patch.object(publish,'head_tree',return_value=('head','tree',{})), patch.object(publish,'write_json'), patch.object(publish,'finish_pending') as finish, patch.object(publish,'api') as api:
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
        with patch.object(publish,'oss_options',return_value={'mode':'preview'}), \
             patch.object(publish,'hot_snapshot',return_value=[]), patch.object(publish,'head_tree',return_value=('head','tree',{})), patch.object(publish,'write_json'), patch.object(publish,'finish_pending') as finish, patch.object(publish,'api') as api:
            publish.sync_hot(state)
            api.assert_called_once_with('POST',publish.REPO+'/actions/workflows/publish.yml/dispatches',{'ref':'main'})
            self.assertEqual(state['pending']['files'],{})
            self.assertEqual(state['pending']['hot'],[])
            finish.assert_called_once_with(state)

class HotVerificationTests(unittest.TestCase):
    def test_event_expiring_during_build_does_not_block_the_next_news_publication(self):
        from unittest.mock import patch
        import publish
        expired={'title':'Expired event','story':'/story/expired','heat':10.5}
        current={'title':'Current event','story':'/story/current','heat':12.3}
        pending={'hot':[expired,current]}
        with patch.object(publish,'get',side_effect=['Current event /story/current','返回']), patch.object(publish,'hot_snapshot',return_value=[current]):
            publish.verify_hot(pending,{'pages':['/story/current']})
        self.assertEqual(pending['hot'],[current])

    def test_missing_active_event_still_blocks_publication(self):
        from unittest.mock import patch
        import publish
        entry={'title':'Current event','story':'/story/current'}
        pending={'hot':[entry]}
        with patch.object(publish,'get',return_value='No events'), patch.object(publish,'hot_snapshot',return_value=[entry]):
            with self.assertRaisesRegex(RuntimeError,'missing'):
                publish.verify_hot(pending,{'pages':[]})
        self.assertEqual(pending['hot'],[entry])

    def test_a_link_without_its_exported_detail_is_not_excused_by_expiry(self):
        from unittest.mock import patch
        import publish
        entry={'title':'Expired event','story':'/story/expired'}
        with patch.object(publish,'get',return_value='Expired event /story/expired'), patch.object(publish,'hot_snapshot',return_value=[]):
            with self.assertRaisesRegex(RuntimeError,'missing'):
                publish.verify_hot({'hot':[entry]},{'pages':[]})

    def test_failed_current_ranking_read_does_not_clear_expectations(self):
        from unittest.mock import patch
        import publish
        pending={'hot':[{'title':'Event','story':'/story/event'}]}
        with patch.object(publish,'get',return_value='No events'), patch.object(publish,'hot_snapshot',side_effect=RuntimeError('API unavailable')):
            with self.assertRaisesRegex(RuntimeError,'API unavailable'):
                publish.verify_hot(pending,{'pages':[]})
        self.assertEqual(len(pending['hot']),1)

class CompanyTopicVerificationTests(unittest.TestCase):
    def test_unknown_subject_does_not_hide_a_later_exported_company_topic(self):
        from unittest.mock import patch
        import publish
        with patch.object(publish,'get',return_value='Meta topic') as get:
            publish.verify_subject_topic(['amd','meta'], 'Meta', {'pages':['/topics/meta']})
        get.assert_called_once_with(publish.CONFIG['siteUrl']+'/topics/meta/index.html')

    def test_subject_ids_are_mapped_to_configured_topic_slugs(self):
        import tempfile
        from unittest.mock import patch
        import publish
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp);(root/'industry').mkdir()
            (root/'industry/topics.json').write_text(json.dumps({'topics':[{'entityId':'company-id','slug':'company-page'}]}))
            with patch.object(publish,'ROOT',root), patch.object(publish,'get') as get:
                publish.verify_subject_topic(['company-id'], '', {'pages':['/topics/company-page']})
            get.assert_called_once_with(publish.CONFIG['siteUrl']+'/topics/company-page/index.html')

    def test_advertised_company_topic_without_an_export_fails(self):
        from unittest.mock import patch
        import publish
        with patch.object(publish,'get') as get:
            with self.assertRaisesRegex(RuntimeError,'company topic link'):
                publish.verify_subject_topic(['meta'], '<a href="/topics/meta/index.html">Meta</a>', {'pages':[]})
            get.assert_not_called()

    def test_an_empty_unlinked_company_topic_may_be_skipped(self):
        from unittest.mock import patch
        import publish
        with patch.object(publish,'get') as get:
            publish.verify_subject_topic(['meta'], 'No topic links', {'pages':[]})
            get.assert_not_called()

class FulltextPublicationTests(unittest.TestCase):
    def test_publication_includes_body_snapshots_but_excludes_runtime_and_model_outputs(self):
        import tempfile
        from unittest.mock import patch
        import publish
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp)
            for name in ['site/editions/day.json','site/rankings/models.json','site/fulltext/article.json','.data/service/fulltext-answer.json']:
                file=root/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_text('{}')
            with patch.object(publish,'ROOT',root):
                self.assertEqual(set(publish.public_files()),{'site/editions/day.json','site/rankings/models.json','site/fulltext/article.json'})




class OssReleaseTests(unittest.TestCase):
    def test_upload_plan_orders_dependencies_and_skips_unchanged_pages(self):
        from oss_release import upload_plan
        current = {'assets/script.js': 'new', 'index.html': 'new', 'daily/index.html': 'old',
                   'items/new/index.html': 'new', 'export-manifest.json': 'time'}
        pages = ['/', '/daily', '/items/new']
        previous = {'objects': {'daily/index.html': 'old', 'export-manifest.json': 'old'},
                    'pages': ['/', '/daily']}
        self.assertEqual(upload_plan(current, {'pages': pages}, previous),
                         [['assets/script.js'], ['items/new/index.html'], ['index.html'], ['export-manifest.json']])
        self.assertEqual(upload_plan(current, {'pages': pages}, {'objects': current, 'pages': pages}), [])
        self.assertEqual(upload_plan(current, {'pages': ['/']}, {'objects': current, 'pages': pages}),
                         [[], [], [], ['export-manifest.json']])

    def test_active_oss_rejects_a_manifest_other_than_its_verified_baseline(self):
        from tempfile import TemporaryDirectory
        from unittest.mock import patch
        import oss_release
        baseline = {'objects': {'export-manifest.json': oss_release.digest(b'oss')}}
        with patch.object(oss_release, 'can_upload', return_value=True), \
             patch.object(oss_release, 'read_json', return_value=baseline), \
             patch.object(oss_release, 'RECOVERY', pathlib.Path(self.enterContext(TemporaryDirectory()))), \
             patch.object(oss_release, 'recover'), \
             patch.object(oss_release, 'download', return_value=b'other') as download, \
             patch.object(oss_release, 'status'), patch.object(oss_release, 'export') as export:
            with self.assertRaisesRegex(RuntimeError, 'Public HTTPS domain'):
                oss_release._release(active=True)
            download.assert_called_once_with(oss_release.CONFIG['siteUrl'], 'export-manifest.json', require_oss=True)
            export.assert_not_called()

    def test_active_oss_checks_the_public_domain_before_rolling_back(self):
        from unittest.mock import patch
        import oss_release
        baseline = {'objects': {'export-manifest.json': oss_release.digest(b'oss')}}
        with patch.object(oss_release, 'can_upload', return_value=True), \
             patch.object(oss_release, 'read_json', return_value=baseline), \
             patch.object(oss_release, 'download', side_effect=RuntimeError('Public HTTPS domain is not served by OSS')), \
             patch.object(oss_release, 'status'), patch.object(oss_release, 'recover') as recover:
            with self.assertRaisesRegex(RuntimeError, 'Public HTTPS domain'):
                oss_release._release(active=True)
            recover.assert_not_called()

    def test_recovery_restores_verified_previous_bytes_after_interruption(self):
        from tempfile import TemporaryDirectory
        from unittest.mock import patch
        import oss_release
        content = {'index.html': b'old page', 'export-manifest.json': b'old manifest'}
        expected = {name: oss_release.digest(body) for name, body in content.items()}
        restored = {}

        base = oss_release.CONFIG['siteUrl']

        def download(request_base, name, require_oss):
            self.assertEqual(request_base, base)
            self.assertTrue(require_oss)
            return content[name]

        def upload(_settings, directory, name, endpoint):
            self.assertEqual(endpoint, base)
            restored[name] = (directory / name).read_bytes()

        with TemporaryDirectory() as tmp, \
             patch.object(oss_release, 'RECOVERY', pathlib.Path(tmp) / 'recovery'), \
             patch.object(oss_release, 'download', side_effect=download), \
             patch.object(oss_release, 'upload', side_effect=upload), \
             patch.object(oss_release, 'status'):
            oss_release.save_recovery('next', [*content, 'new-only.html'], expected, base)
            oss_release.recover({}, {'transaction': 'previous'}, base)
            self.assertEqual(restored, content)
            self.assertFalse(oss_release.RECOVERY.exists())

    def test_console_requests_are_consumed_once_and_keep_a_run_history(self):
        from tempfile import TemporaryDirectory
        from unittest.mock import patch
        import common
        with TemporaryDirectory() as tmp, patch.object(common, 'DATA', pathlib.Path(tmp)), \
             patch.object(common, 'RUNS', {}):
            inbox = common.DATA / 'requests'
            inbox.mkdir()
            (inbox / 'research').touch()
            self.assertTrue(common.take_request('research'))
            self.assertFalse(common.take_request('research'))
            common.start_task('research')
            common.status('research', phase='researching', steps=2, privateData='hidden')
            common.status('research', phase='checked')
            lines = (common.DATA / 'research-events.jsonl').read_text().splitlines()
            events = [json.loads(line) for line in lines]
            self.assertEqual(events[0]['runId'], events[1]['runId'])
            self.assertEqual(events[0]['steps'], 2)
            self.assertNotIn('privateData', events[0])

if __name__ == '__main__': unittest.main()
