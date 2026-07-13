"""Конфигурация gunicorn для прода.

По умолчанию gunicorn поднимает ОДИН синхронный воркер — он обрабатывает
строго один запрос за раз, поэтому параллельные вызовы API от SPA встают в
очередь и страницы «висят» на скелетонах (на деве не видно: runserver
многопоточный). Число воркеров считаем от числа ядер; при нехватке памяти
можно ограничить через WEB_CONCURRENCY, потоки — через GUNICORN_THREADS.
"""

import multiprocessing
import os

bind = "0.0.0.0:8000"
workers = int(os.getenv("WEB_CONCURRENCY", multiprocessing.cpu_count() * 2 + 1))
threads = int(os.getenv("GUNICORN_THREADS", "2"))
# gunicorn держит heartbeat-файлы воркеров в worker_tmp_dir; на tmpfs (/dev/shm)
# это исключает залипания на некоторых окружениях с медленным /tmp.
worker_tmp_dir = "/dev/shm"
