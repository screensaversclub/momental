import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openDB, IDBPDatabase } from "idb";
import { differenceInDays, startOfDay } from "date-fns";
import { Tooltip } from "react-tooltip";

interface SpendEntry {
  id: number;
  timestamp: Date;
  amount: number | string;
  note?: string;
}

interface Settings {
  dailyBudget: number;
  startDate: Date;
  startAmount: number;
}

function App() {
  const dbRef = useRef<IDBPDatabase>();
  const [entries, setEntries] = useState<SpendEntry[]>([]);
  const [settings, setSettings] = useState<Settings>();
  const [editingSettings, setEditingSettings] = useState(false);

  const balance = useMemo(() => {
    if (settings === undefined) {
      return NaN;
    }
    return entries
      .sort((a, b) => {
        return a.timestamp.getTime() - b.timestamp.getTime();
      })
      .reduce((p, c) => {
        return p - Number(c.amount);
      }, settings.startAmount + settings.dailyBudget * (differenceInDays(new Date(), settings.startDate) + 1));
  }, [entries, settings]);

  const loadEntries = useCallback(async () => {
    if (dbRef.current === undefined) {
      return;
    }
    const tx = dbRef.current.transaction("entries", "readonly");
    const store = tx.objectStore("entries");
    const _entries = await store.getAll();
    setEntries(_entries);
  }, []);

  const loadSettings = useCallback(async () => {
    if (dbRef.current === undefined) {
      return;
    }
    const tx = dbRef.current.transaction("settings", "readonly");
    const store = tx.objectStore("settings");
    const _settings = await store.get("settings");
    setSettings(_settings);
  }, []);

  const deleteEntry = useCallback(async (id: number) => {
    if (dbRef.current === undefined) {
      return;
    }
    const tx = dbRef.current.transaction("entries", "readwrite");
    const store = tx.objectStore("entries");
    await store.delete(id);
  }, []);

  useEffect(() => {
    const dbPromise = openDB("testdb", 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("entries")) {
          database.createObjectStore("entries", {
            keyPath: "id",
            autoIncrement: true,
          });
        }

        if (!database.objectStoreNames.contains("settings")) {
          database.createObjectStore("settings");
        }
      },
    });

    dbPromise.then((db) => {
      dbRef.current = db;
      const tx = db.transaction("entries", "readonly");
      const store = tx.objectStore("entries");
      store.getAll().then((v) => {
        setEntries(() => v as SpendEntry[]);
      });

      const settingsTx = db.transaction("settings", "readwrite");
      const settingsStore = settingsTx.objectStore("settings");
      settingsStore.get("settings").then((result) => {
        if (result === undefined) {
          // init settings
          const initSettings = {
            startAmount: 0,
            startDate: startOfDay(new Date()),
            dailyBudget: 40,
          };
          settingsStore.add(initSettings, "settings").then(() => {
            setSettings(initSettings);
          });
        } else {
          setSettings({ ...result, startDate: startOfDay(result.startDate) });
        }
      });
    });
  }, []);

  return (
    <main className="w-[100vw] overflow-hidden h-[100vh] fixed top-0 left-0">
      <div className="bg-[#14C31B] h-[40px] text-center text-white p-2 flex justify-center">
        <img src="/header-logo.png" alt="logo" className="w-8" />
      </div>
      <div
        id="ledger"
        className="h-[50vh] w-full bg-white overflow-y-scroll no-scrollbar"
      >
        {entries
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between px-2 py-1 border-b"
            >
              <span className="text-xs">
                {entry.timestamp.toLocaleString()}
              </span>

              <span className="w-[5em] text-right font-mono text-sm [&::before]:block flex justify-between [&::before]:text-gray-400 [&::before]:content-['$']">
                {Number(entry.amount).toFixed(2)}
              </span>

              {entry.note !== undefined && entry.note.length > 0 ? (
                <>
                  <i
                    data-tooltip-content={entry.note}
                    data-tooltip-id="my-tooltip"
                  >
                    ℹ
                  </i>

                  <Tooltip id="my-tooltip" />
                </>
              ) : (
                <i></i>
              )}

              <button
                className="text-sm"
                onClick={async () => {
                  await deleteEntry(entry.id);
                  await loadEntries();
                }}
              >
                &times;
              </button>
            </div>
          ))}
      </div>

      <div className="px-2 py-2 w-full h-[calc(50vh_-_40px)] border-t">
        {editingSettings ? (
          settings === undefined ? (
            <>Loading</>
          ) : (
            <SettingsEditor
              settings={settings}
              onUpdate={async (s) => {
                if (dbRef.current === undefined) {
                  return;
                }

                const tx = dbRef.current.transaction("settings", "readwrite");
                const store = tx.objectStore("settings");
                await store.put(s, "settings");
                await loadSettings();
              }}
            />
          )
        ) : (
          <div className="flex flex-col gap-2">
            <div className="p-2 bg-white border rounded">
              <h2 className="text-xs uppercase">bal:</h2>
              <span className="font-mono">${balance.toFixed(2)}</span>
            </div>
            <EntryEditor
              onNewEntry={async (entry) => {
                if (dbRef.current === undefined) {
                  return;
                }

                const tx = dbRef.current.transaction("entries", "readwrite");
                const store = tx.objectStore("entries");
                await store.add(entry);
                await loadEntries();
              }}
            />
          </div>
        )}
      </div>

      <div className="toggle">
        <button
          className={editingSettings ? "" : "active"}
          onClick={() => {
            setEditingSettings((a) => !a);
          }}
        >
          ⛰︎
        </button>
        <button
          className={!editingSettings ? "" : "active"}
          onClick={() => {
            setEditingSettings((a) => !a);
          }}
        >
          ⚙︎
        </button>
      </div>
    </main>
  );
}

const EntryEditor = ({
  onNewEntry,
}: {
  onNewEntry: (entry: Omit<SpendEntry, "id">) => void;
}) => {
  const [entry, setEntry] = useState<Omit<SpendEntry, "id">>({
    amount: 0,
    timestamp: new Date(),
    note: "",
  });

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={entry.amount}
        placeholder="0.00"
        className="p-1 font-mono text-lg text-center"
        onChange={(e) => {
          setEntry((ent) => ({ ...ent, amount: e.target.value }));
        }}
        onBlur={(e) => {
          setEntry((ent) => ({ ...ent, amount: Number(e.target.value) }));
        }}
      />
      <input
        type="text"
        value={entry.note}
        placeholder="note (optional)"
        className="p-1 text-lg text-center"
        onChange={(e) => {
          setEntry((ent) => ({ ...ent, note: e.target.value }));
        }}
      />
      <button
        disabled={isNaN(Number(entry.amount))}
        className="opacity-100 [&:disabled]:opacity-50"
        onClick={() => {
          onNewEntry({ ...entry, timestamp: new Date() });
          setEntry({
            amount: 0,
            timestamp: new Date(),
            note: "",
          });
        }}
      >
        Enter
      </button>
    </div>
  );
};

const SettingsEditor = ({
  settings,
  onUpdate,
}: {
  settings: Settings;
  onUpdate: (settings: Settings) => void;
}) => {
  const [data, setData] = useState<Settings>(settings);
  const [persisted, setPersisted] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      onUpdate(data);
    }, 1000);
    return () => {
      clearTimeout(id);
    };
  }, [data]);

  useEffect(() => {
    navigator.storage.persisted().then((v) => setPersisted(v));
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div>
        <input
          type="number"
          value={data.dailyBudget}
          className="w-full p-1 text-lg text-center"
          placeholder="daily budget"
          onChange={(e) => {
            setData((d) => ({
              ...d,
              dailyBudget: Number(parseFloat(e.target.value).toFixed(2)),
            }));
          }}
        />
      </div>

      <div>
        <input
          placeholder="starting amount"
          type="number"
          className="w-full p-1 text-lg text-center"
          value={data.startAmount}
          onChange={(e) => {
            setData((d) => ({
              ...d,
              startAmount: Number(parseFloat(e.target.value).toFixed(2)),
            }));
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <label>start date</label>
        <input
          type="date"
          value={data.startDate.toISOString().substring(0, 10)}
          required={true}
          className="flex-grow text-lg"
          onChange={(e) => {
            setData((d) => ({
              ...d,
              startDate: startOfDay(new Date(e.target.value)),
            }));
          }}
        />
      </div>

      <div className="text-sm text-center">
        {differenceInDays(new Date(), settings?.startDate || new Date()) + 1}{" "}
        days
      </div>

      <div
        className="p-1 text-sm text-center border rounded cursor-pointer border-text border-1"
        onClick={async () => {
          if (!persisted) {
            await navigator.storage.persist();
          }
        }}
      >
        {persisted ? "data persisted" : "request persistence"}
      </div>
    </div>
  );
};

export default App;
