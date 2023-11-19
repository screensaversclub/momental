import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openDB, IDBPDatabase } from "idb";
import { differenceInDays, format, startOfDay } from "date-fns";
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
    <main className="w-[100vw] max-w-[600px] overflow-hidden h-[100vh] fixed top-0 left-[50%] translate-x-[-50%]">
      <div className="bg-[#14C31B] h-[60px] items-center text-white p-2 flex justify-center relative">
        <img
          src="/header-logo.png"
          alt="logo"
          className="w-[40px] aspect-[1.5] block"
        />
        <div className="absolute left-2 top-[50%] translate-y-[-50%] text-left width-[20em] text-white bg-[#14C31B] h-full flex flex-col justify-center">
          <h2 className="m-0 p-0 text-xs uppercase leading-[1]">bal:</h2>
          <span className="font-mono text-sm leading-[1.2]">
            ${balance.toFixed(2)}
          </span>
        </div>
        <div className="absolute right-2 top-[50%] translate-y-[-50%] text-white">
          <button
            type="button"
            onClick={() => {
              setEditingSettings((a) => !a);
            }}
            className={`${
              editingSettings
                ? "bg-white text-[#14C31B]"
                : "bg-[#14C31B] text-white"
            } text-[30px] leading-[1] flex items-center justify-center border-none p-0 px-2 w-[40px] h-[40px]`}
          >
            ⚙︎
          </button>
        </div>
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
              <span className="text-xs text-black/50 w-[6em]">
                {format(entry.timestamp, "H:mm:ss a")}
              </span>

              <span className="w-[7em] text-right font-mono text-sm [&::before]:block flex justify-between [&::before]:text-gray-400 [&::before]:content-['$']">
                {Number(entry.amount).toFixed(2)}
              </span>

              <div className="w-[5em] flex gap-1 justify-end">
                {entry.note !== undefined && entry.note.length > 0 && (
                  <>
                    <i
                      data-tooltip-content={entry.note}
                      data-tooltip-id="my-tooltip"
                      className="flex items-center justify-center w-8 border rounded"
                    >
                      i
                    </i>

                    <Tooltip id="my-tooltip" />
                  </>
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
            </div>
          ))}
      </div>

      <div className="px-2 py-2 w-full h-[calc(50vh_-_60px)] border-t">
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
    </main>
  );
}

const EntryEditor = ({
  onNewEntry,
}: {
  onNewEntry: (entry: Omit<SpendEntry, "id">) => void;
}) => {
  const [entry, setEntry] = useState<Omit<SpendEntry, "id">>({
    amount: "",
    timestamp: new Date(),
    note: "",
  });

  return (
    <div className="flex flex-col py-4 gap-2">
      <input
        type="text"
        value={entry.amount}
        aria-label="spend amount"
        placeholder="Spend amount"
        className="p-1 font-mono text-lg text-center border border-gray-400"
        onFocus={(e) => {
          e.target.value = "";
        }}
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
        aria-label="note for this spend entry"
        placeholder="note (optional)"
        className="p-1 text-lg text-center border border-gray-400"
        onChange={(e) => {
          setEntry((ent) => ({ ...ent, note: e.target.value }));
        }}
      />
      <button
        disabled={isNaN(Number(entry.amount)) || Number(entry.amount) === 0}
        className="opacity-100 [&:disabled]:opacity-50 bg-[#14C31B] text-white rounded-lg text-lg mt-4 py-2"
        aria-label="enter new spend"
        onClick={() => {
          onNewEntry({ ...entry, timestamp: new Date() });
          setEntry({
            amount: "",
            timestamp: new Date(),
            note: "",
          });
        }}
      >
        New Spend
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
    }, 500);
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
