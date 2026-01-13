'use strict';

(function (global) {
    if (global.initStudyClipboard) {
        return;
    }

    const DB_NAME = 'study-space-clipboard';
    const DB_VERSION = 1;
    const STORE_NAME = 'clipboard-items';
    const CHANNEL_NAME = 'study-space-clipboard-channel';
    const STORAGE_SYNC_KEY = 'study-space-clipboard-sync';
    const MAX_ITEMS_DEFAULT = 32;
    const TEXT_SNIPPET_TYPES = new Set([
        'application/json',
        'application/xml',
        'application/javascript',
        'application/x-javascript',
        'application/svg+xml'
    ]);
    const SNIPPET_CHAR_LIMIT = 160;

    let cachedDbPromise = null;

    function openDatabase() {
        if (cachedDbPromise) {
            return cachedDbPromise;
        }
        cachedDbPromise = new Promise((resolve, reject) => {
            if (!global.indexedDB) {
                reject(new Error('IndexedDB not available'));
                return;
            }
            const request = global.indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        });
        return cachedDbPromise;
    }

    async function loadStoredRecords() {
        try {
            const db = await openDatabase();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
            });
        } catch (error) {
            console.error('[Clipboard] Failed to load stored items:', error);
            return [];
        }
    }

    async function saveRecords(records) {
        try {
            const db = await openDatabase();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                tx.oncomplete = () => resolve();
                tx.onabort = tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));

                const clearRequest = store.clear();
                clearRequest.onerror = () => reject(clearRequest.error || new Error('IndexedDB clear failed'));
                clearRequest.onsuccess = () => {
                    records.forEach((record) => {
                        store.put(record);
                    });
                };
            });
        } catch (error) {
            console.error('[Clipboard] Failed to persist items:', error);
        }
    }

    function serializeItem(item) {
        const record = {
            id: item.id,
            name: item.name,
            size: item.size,
            type: item.type,
            displayType: item.displayType || item.type || 'Файл',
            snippet: item.snippet || '',
            previewKind: item.previewKind || '',
            previewIcon: item.previewIcon || '',
            capturedAt: item.capturedAt || Date.now(),
            fileName: item.fileName || item.name,
            fileLastModified: item.fileLastModified || (item.file && item.file.lastModified) || Date.now()
        };
        // include any uploaded remote references so other tabs/clients can use them
        if (item.remotePath) record.remotePath = item.remotePath;
        if (item.remoteUrl) record.remoteUrl = item.remoteUrl;
        if (item.file instanceof Blob) {
            record.fileBlob = item.file;
        } else if (item.fileBlob instanceof Blob) {
            record.fileBlob = item.fileBlob;
        }
        return record;
    }

    function deserializeRecord(record) {
        const base = {
            id: record.id,
            name: record.name,
            size: record.size,
            type: record.type,
            displayType: record.displayType || record.type || 'Файл',
            snippet: record.snippet || '',
            previewKind: record.previewKind || '',
            previewIcon: record.previewIcon || '',
            capturedAt: record.capturedAt || Date.now(),
            fileName: record.fileName || record.name,
            fileLastModified: record.fileLastModified || Date.now(),
            file: null,
            fileBlob: record.fileBlob instanceof Blob ? record.fileBlob : null,
            previewUrl: record.remoteUrl || null,
            previewPrepared: false
        };
        if (base.fileBlob) {
            try {
                base.file = new File([base.fileBlob], base.fileName, {
                    type: base.type || base.fileBlob.type || '',
                    lastModified: base.fileLastModified
                });
            } catch (error) {
                base.file = base.fileBlob;
            }
        }
        // if record contains a remoteUrl, assume preview is ready
        if (record.remoteUrl) {
            base.remoteUrl = record.remoteUrl;
            base.remotePath = record.remotePath || null;
            base.previewPrepared = true;
            base.previewKind = base.previewKind || 'image';
        }
        return base;
    }

    function formatBytes(bytes) {
        if (typeof bytes !== 'number' || Number.isNaN(bytes)) {
            return '0 B';
        }
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let value = bytes;
        let index = 0;
        while (value >= 1024 && index < units.length - 1) {
            value /= 1024;
            index += 1;
        }
        const formatted = value % 1 === 0 ? value : value.toFixed(1);
        return `${formatted} ${units[index]}`;
    }

    function pickPreviewIcon(type) {
        if (!type) return '📄';
        if (type.includes('sheet') || type.includes('excel') || type.includes('spreadsheet')) return '📊';
        if (type.includes('presentation') || type.includes('powerpoint') || type.includes('slideshow')) return '📽️';
        if (type.includes('word') || type.includes('document') || type.includes('msword')) return '📃';
        if (type.includes('audio')) return '🎵';
        if (type.includes('video')) return '🎬';
        if (type.includes('pdf')) return '📕';
        if (type.includes('zip') || type.includes('compressed') || type.includes('archive')) return '🗜️';
        if (type.includes('text')) return '📝';
        return '📄';
    }

    function computeDisplayType(file) {
        if (!file) return 'Файл';
        if (file.type) return file.type;
        const parts = (file.name || '').split('.');
        if (parts.length > 1) {
            return parts.pop().toUpperCase();
        }
        return 'Файл';
    }

    function createClipboardItemFromFile(file) {
        const now = Date.now();
        return {
            id: (global.crypto && typeof global.crypto.randomUUID === 'function')
                ? global.crypto.randomUUID()
                : `item-${now}-${Math.random().toString(16).slice(2)}`,
            name: file.name || 'Файл',
            size: file.size,
            type: file.type || '',
            displayType: computeDisplayType(file),
            file,
            fileBlob: null,
            fileName: file.name || 'file',
            fileLastModified: file.lastModified || now,
            snippet: '',
            previewKind: '',
            previewIcon: '',
            capturedAt: now,
            previewUrl: null,
            remotePath: null,
            remoteUrl: null,
            previewPrepared: false
        };
    }

    // Uploads an item's file to the server via ssApi.uploadFile (if available)
    async function uploadItem(item) {
        try {
            if (!item || !item.file || item.remoteUrl) return;
            if (!global.window || !global.window.ssApi || typeof global.window.ssApi.uploadFile !== 'function') return;
            // Prefer streaming via FormData: pass the File object to ssApi.uploadFile
            const payload = { file: item.file, name: item.fileName || item.name || item.file.name };
            const resp = await global.window.ssApi.uploadFile(payload);
            if (resp && resp.ok) {
                item.remotePath = resp.path || resp.data?.path || null;
                item.remoteUrl = resp.publicUrl || resp.data?.publicUrl || null;
                if (item.remoteUrl) {
                    item.previewUrl = item.remoteUrl;
                    item.previewPrepared = true;
                }
                // Optionally release local blob to save memory (keep blob until persisted)
                // item.file = null;
                schedulePersist();
                updateClipboardUI();
            }
        } catch (err) {
            // Do not disrupt user flow on upload errors
            console.warn('[Clipboard] upload failed', err);
        }
    }

    function sanitizeSnippet(value) {
        return (value || '').replace(/\s+/g, ' ').trim();
    }

    function readSnippetForItem(item, onUpdate) {
        if (!item.file || typeof item.file.slice !== 'function' || typeof item.file.text !== 'function') {
            return;
        }
        item.file.slice(0, 4096).text().then((text) => {
            const cleaned = sanitizeSnippet(text);
            if (!cleaned) {
                return;
            }
            item.snippet = cleaned.length > SNIPPET_CHAR_LIMIT
                ? `${cleaned.slice(0, SNIPPET_CHAR_LIMIT)}…`
                : cleaned;
            if (typeof onUpdate === 'function') {
                onUpdate();
            }
        }).catch(() => {
            // Ignore text extraction errors.
        });
    }

    function initStudyClipboard(options = {}) {
        const doc = options.document || global.document;
        if (!doc) {
            return null;
        }

        const rootId = options.rootId || 'homeClipboard';
        const capsuleId = options.capsuleId || 'homeClipboardCapsule';
        const panelId = options.panelId || 'homeClipboardPanel';
        const listId = options.listId || 'homeClipboardList';
        const countId = options.countId || 'homeClipboardCount';
        const emptyId = options.emptyId || 'homeClipboardEmpty';

        const root = doc.getElementById(rootId);
        const capsule = doc.getElementById(capsuleId);
        const panel = doc.getElementById(panelId);
        const list = doc.getElementById(listId);
        const countEl = doc.getElementById(countId);
        const emptyEl = doc.getElementById(emptyId);

        if (!root || !capsule || !panel || !list) {
            return null;
        }

        const instanceId = options.instanceId || ((global.crypto && typeof global.crypto.randomUUID === 'function')
            ? global.crypto.randomUUID()
            : `cb-${Date.now()}-${Math.random().toString(16).slice(2)}`);
        const reducedMotion = options.reducedMotion !== undefined
            ? !!options.reducedMotion
            : !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const maxItems = options.maxItems || MAX_ITEMS_DEFAULT;
        const channelName = options.channelName || CHANNEL_NAME;
        const broadcast = (typeof global.BroadcastChannel === 'function')
            ? new global.BroadcastChannel(channelName)
            : null;

        let clipboardItems = [];
        let clipboardOpen = false;
        let dragDepth = 0;
        const elementMap = new Map();
        let persistTimer = null;
        let loadingFromStore = false;
        let hoverIntentTimer = null;

        function notifyPeers() {
            if (broadcast) {
                broadcast.postMessage({ type: 'clipboard-refresh', source: instanceId, timestamp: Date.now() });
            } else if (global.localStorage) {
                try {
                    global.localStorage.setItem(STORAGE_SYNC_KEY, `${instanceId}:${Date.now()}`);
                } catch (error) {
                    // Ignore storage quota errors.
                }
            }
        }

        async function flushPersist() {
            if (loadingFromStore) {
                return;
            }
            const records = clipboardItems.map((item) => serializeItem(item));
            await saveRecords(records);
            notifyPeers();
        }

        function schedulePersist() {
            if (loadingFromStore) {
                return;
            }
            if (persistTimer) {
                global.clearTimeout(persistTimer);
            }
            persistTimer = global.setTimeout(() => {
                persistTimer = null;
                flushPersist().catch(() => {});
            }, 220);
        }

        function clearClipboardPreviews() {
            clipboardItems.forEach((item) => {
                if (item.previewUrl && global.URL && typeof global.URL.revokeObjectURL === 'function') {
                    global.URL.revokeObjectURL(item.previewUrl);
                }
                item.previewUrl = null;
                item.previewPrepared = false;
            });
        }

        function fillPreview(previewEl, item) {
            previewEl.innerHTML = '';
            if (item.previewKind === 'image' && item.previewUrl) {
                const img = doc.createElement('img');
                img.src = item.previewUrl;
                img.alt = item.name;
                previewEl.appendChild(img);
            } else {
                const iconEl = doc.createElement('div');
                iconEl.className = 'home-clipboard-preview-icon';
                iconEl.textContent = item.previewIcon || pickPreviewIcon((item.type || '').toLowerCase());
                previewEl.appendChild(iconEl);
            }
        }

        function updateSnippetDisplay(item) {
            const record = elementMap.get(item.id);
            if (!record) {
                return;
            }
            if (item.snippet) {
                if (record.snippet) {
                    record.snippet.textContent = item.snippet;
                } else {
                    const snippetEl = doc.createElement('p');
                    snippetEl.className = 'home-clipboard-snippet';
                    snippetEl.textContent = item.snippet;
                    record.info.insertBefore(snippetEl, record.details);
                    record.snippet = snippetEl;
                }
            } else if (record.snippet) {
                record.snippet.remove();
                record.snippet = null;
            }
        }

        function prepareItemPreview(item) {
            if (item.previewPrepared) {
                return;
            }
            const mime = (item.type || '').toLowerCase();
            if (mime.startsWith('image/')) {
                item.previewKind = 'image';
                if (item.remoteUrl) {
                    item.previewUrl = item.remoteUrl;
                } else if (item.file && global.URL && typeof global.URL.createObjectURL === 'function') {
                    if (!item.previewUrl) {
                        item.previewUrl = global.URL.createObjectURL(item.file);
                    }
                }
            } else if (mime.startsWith('text/') || TEXT_SNIPPET_TYPES.has(mime)) {
                item.previewKind = 'icon';
                item.previewIcon = '📝';
                if (!item.snippet) {
                    readSnippetForItem(item, () => {
                        updateSnippetDisplay(item);
                        schedulePersist();
                    });
                }
            } else if (mime.startsWith('video/')) {
                item.previewKind = 'icon';
                item.previewIcon = '🎬';
            } else if (mime.startsWith('audio/')) {
                item.previewKind = 'icon';
                item.previewIcon = '🎵';
            } else if (mime.includes('pdf')) {
                item.previewKind = 'icon';
                item.previewIcon = '📕';
            } else if (mime.includes('zip') || mime.includes('compressed')) {
                item.previewKind = 'icon';
                item.previewIcon = '🗜️';
            } else if (mime.includes('sheet') || mime.includes('excel')) {
                item.previewKind = 'icon';
                item.previewIcon = '📊';
            } else if (mime.includes('presentation') || mime.includes('powerpoint')) {
                item.previewKind = 'icon';
                item.previewIcon = '📽️';
            } else {
                item.previewKind = 'icon';
                item.previewIcon = pickPreviewIcon(mime);
            }
            item.previewPrepared = true;
        }

        function createClipboardEntry(item) {
            const entry = doc.createElement('li');
            entry.className = 'home-clipboard-item';
            entry.dataset.itemId = item.id;
            entry.setAttribute('draggable', 'true');

            const preview = doc.createElement('div');
            preview.className = 'home-clipboard-preview';
            fillPreview(preview, item);

            const title = doc.createElement('div');
            title.className = 'home-clipboard-item-title';
            title.textContent = item.name;

            const info = doc.createElement('div');
            info.className = 'home-clipboard-info';
            info.appendChild(title);

            let snippetEl = null;
            if (item.snippet) {
                snippetEl = doc.createElement('p');
                snippetEl.className = 'home-clipboard-snippet';
                snippetEl.textContent = item.snippet;
                info.appendChild(snippetEl);
            }

            const details = doc.createElement('div');
            details.className = 'home-clipboard-item-details';
            details.textContent = `${item.displayType || 'Файл'} · ${formatBytes(item.size)}`;
            info.appendChild(details);

            entry.append(preview, info);

            entry.addEventListener('dragstart', (event) => {
                entry.classList.add('dragging');
                if (!event.dataTransfer) {
                    return;
                }
                event.dataTransfer.effectAllowed = 'copy';
                event.dataTransfer.setData('text/plain', item.name);
                try {
                    event.dataTransfer.setData('application/x-study-clipboard', JSON.stringify({
                        name: item.name,
                        size: item.size,
                        type: item.displayType || 'Файл',
                        mime: item.type || ''
                    }));
                } catch (error) {
                    // Ignore structured data errors.
                }
                if (event.dataTransfer.items && item.file instanceof File) {
                    try {
                        event.dataTransfer.items.add(item.file);
                    } catch (error) {
                        // Ignore browsers that block manual file injection.
                    }
                }
            });

            entry.addEventListener('dragend', () => {
                entry.classList.remove('dragging');
            });

            elementMap.set(item.id, { entry, preview, info, details, snippet: snippetEl });
            return entry;
        }

        function updateClipboardUI() {
            list.innerHTML = '';
            elementMap.clear();

            if (countEl) {
                countEl.textContent = clipboardItems.length.toString();
                countEl.setAttribute('aria-hidden', clipboardItems.length ? 'false' : 'true');
            }
            root.classList.toggle('has-items', clipboardItems.length > 0);
            if (emptyEl) {
                emptyEl.setAttribute('aria-hidden', clipboardItems.length ? 'true' : 'false');
            }

            clipboardItems.forEach((item) => {
                prepareItemPreview(item);
                const entry = createClipboardEntry(item);
                list.appendChild(entry);
            });
        }

        function isFileDrag(event) {
            const dt = event.dataTransfer;
            if (!dt) {
                return false;
            }
            const types = dt.types ? Array.from(dt.types) : [];
            if (types.includes('Files')) {
                return true;
            }
            if (types.length === 0 && dt.files && dt.files.length) {
                return true;
            }
            return dt.files && dt.files.length > 0;
        }

        function captureClipboardFiles(fileList) {
            const files = Array.from(fileList || []);
            if (!files.length) {
                return false;
            }
            const newItems = files.map(file => createClipboardItemFromFile(file));
            newItems.forEach((item) => {
                clipboardItems.unshift(item);
                if (clipboardItems.length > maxItems) {
                    const removed = clipboardItems.pop();
                    if (removed && removed.previewUrl && global.URL && typeof global.URL.revokeObjectURL === 'function') {
                        global.URL.revokeObjectURL(removed.previewUrl);
                    }
                }
            });
            updateClipboardUI();
            schedulePersist();
            // Kick off uploads for newly captured files (non-blocking)
            newItems.forEach(i => {
                try { uploadItem(i); } catch(e) { /* ignore */ }
            });
            if (!reducedMotion) {
                root.classList.remove('captured');
                void root.offsetWidth;
                root.classList.add('captured');
                global.setTimeout(() => root.classList.remove('captured'), 620);
            }
            return true;
        }

        function setClipboardOpen(state) {
            if (state === clipboardOpen) {
                return;
            }
            clipboardOpen = state;
            root.classList.toggle('open', state);
            capsule.setAttribute('aria-expanded', state ? 'true' : 'false');
            panel.setAttribute('aria-hidden', state ? 'false' : 'true');
            if (!state) {
                panel.scrollTop = 0;
            }
        }

        function closeWithIntent() {
            if (!clipboardOpen) {
                return;
            }
            if (hoverIntentTimer) {
                global.clearTimeout(hoverIntentTimer);
            }
            hoverIntentTimer = global.setTimeout(() => {
                if (!root.matches(':hover')) {
                    setClipboardOpen(false);
                }
            }, 240);
        }

        async function loadFromStore() {
            loadingFromStore = true;
            try {
                const records = await loadStoredRecords();
                clearClipboardPreviews();
                clipboardItems = records.map((record) => deserializeRecord(record));
                clipboardItems.sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
                updateClipboardUI();
            } finally {
                loadingFromStore = false;
            }
        }

        root.addEventListener('dragenter', (event) => {
            if (!isFileDrag(event)) {
                return;
            }
            event.preventDefault();
            dragDepth += 1;
            root.classList.add('drag-ready');
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'copy';
            }
        });

        root.addEventListener('dragover', (event) => {
            if (!isFileDrag(event)) {
                return;
            }
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'copy';
            }
        });

        root.addEventListener('dragleave', (event) => {
            if (!isFileDrag(event)) {
                return;
            }
            event.preventDefault();
            dragDepth = Math.max(dragDepth - 1, 0);
            if (dragDepth === 0) {
                root.classList.remove('drag-ready');
            }
        });

        root.addEventListener('drop', (event) => {
            if (!isFileDrag(event)) {
                return;
            }
            event.preventDefault();
            dragDepth = 0;
            root.classList.remove('drag-ready');
            if (captureClipboardFiles(event.dataTransfer ? event.dataTransfer.files : null)) {
                setClipboardOpen(false);
            }
        });

        capsule.addEventListener('mousemove', (event) => {
            const rect = capsule.getBoundingClientRect();
            const mx = ((event.clientX - rect.left) / rect.width) * 100;
            const my = ((event.clientY - rect.top) / rect.height) * 100;
            capsule.style.setProperty('--mx', `${mx}%`);
            capsule.style.setProperty('--my', `${my}%`);
        });

        capsule.addEventListener('mouseleave', () => {
            capsule.style.removeProperty('--mx');
            capsule.style.removeProperty('--my');
        });

        capsule.addEventListener('dblclick', () => {
            setClipboardOpen(!clipboardOpen);
        });

        capsule.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setClipboardOpen(!clipboardOpen);
            } else if (event.key === 'Escape' && clipboardOpen) {
                setClipboardOpen(false);
            }
        });

        doc.addEventListener('click', (event) => {
            if (!clipboardOpen) {
                return;
            }
            if (root.contains(event.target)) {
                return;
            }
            setClipboardOpen(false);
        });

        doc.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && clipboardOpen) {
                setClipboardOpen(false);
            }
        });

        root.addEventListener('mouseleave', closeWithIntent);
        root.addEventListener('mouseenter', () => {
            if (hoverIntentTimer) {
                global.clearTimeout(hoverIntentTimer);
                hoverIntentTimer = null;
            }
        });

        if (broadcast) {
            broadcast.addEventListener('message', (event) => {
                const data = event.data;
                if (!data || data.source === instanceId || data.type !== 'clipboard-refresh') {
                    return;
                }
                loadFromStore().catch(() => {});
            });
        }

        if (typeof global.addEventListener === 'function') {
            global.addEventListener('storage', (event) => {
                if (event.key === STORAGE_SYNC_KEY && event.newValue) {
                    const [source] = event.newValue.split(':');
                    if (source && source !== instanceId) {
                        loadFromStore().catch(() => {});
                    }
                }
            });

            global.addEventListener('beforeunload', clearClipboardPreviews);
        }

        updateClipboardUI();
        loadFromStore().catch(() => {});

        return Object.freeze({
            refresh: () => loadFromStore().catch(() => {}),
            open: () => setClipboardOpen(true),
            close: () => setClipboardOpen(false),
            getItems: () => clipboardItems.map((item) => ({ ...item })),
            destroy: () => {
                clearClipboardPreviews();
                if (broadcast) {
                    broadcast.close();
                }
            }
        });
    }

    global.initStudyClipboard = initStudyClipboard;
})(typeof window !== 'undefined' ? window : this);
