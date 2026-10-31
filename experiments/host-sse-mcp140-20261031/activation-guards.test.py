"""Exercise the actual operator lock guards against disposable files, never a live Store."""
import ast
import tempfile
import unittest
from pathlib import Path


class ActivationLockGuards(unittest.TestCase):
    def test_two_catalog_locks_and_all_session_locks_have_one_expected_owner(self):
        source = Path(__file__).with_name('activate.py')
        functions = [node for node in ast.parse(source.read_text()).body
                     if isinstance(node, ast.FunctionDef) and node.name in {'owner_locks', 'unlocked'}]
        self.assertEqual(len(functions), 2)
        with tempfile.TemporaryDirectory(prefix='activation-lock-guards-') as root:
            data = Path(root)
            paths = [data / 'catalog.sqlite.lock', data / 'host.sqlite.lock']
            for index in range(42):
                directory = data / 'sessions' / str(index)
                directory.mkdir(parents=True)
                paths.append(directory / 'agent.sqlite.lock')
            for path in paths:
                path.write_text('12345')
            namespace = {'data': data, 'pid': lambda: 12345}
            # pi-lens-ignore: S102
            exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), namespace)
            locks = namespace['owner_locks']()
            self.assertEqual(len(locks), 44)
            with self.assertRaises(AssertionError):
                namespace['unlocked']()
            self.assertEqual(namespace['owner_locks'](), locks)
            paths[-1].write_text('54321')
            with self.assertRaises(AssertionError):
                namespace['owner_locks']()
            paths[-1].write_text('12345')
            self.assertEqual(namespace['owner_locks'](), locks)
            for path in paths:
                path.unlink()
            namespace['unlocked']()


if __name__ == '__main__':
    unittest.main()
