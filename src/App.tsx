import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { openDB, IDBPDatabase } from "idb";
import { differenceInDays, format, startOfDay } from "date-fns";
import { Tooltip } from "react-tooltip";
import { Analytics } from "@vercel/analytics/react";
import Plausible from "plausible-tracker";
import { nanoid } from "nanoid";

interface SpendEntry {
  id: number;
  timestamp: Date;
  amount: number | string;
  note?: string;
}

interface Settings {
  anonymousId: string;
  dailyBudget: number;
  startDate: Date;
  startAmount: number;
}

interface DirtySettings {
  anonymousId: string;
  startDate: Date;
  dailyBudget: string;
  startAmount: string;
}

const plausible = Plausible({
  domain: "momentalapp.com",
});

function App() {
  const dbRef = useRef<IDBPDatabase>();
  const [entries, setEntries] = useState<SpendEntry[]>([]);
  const [settings, setSettings] = useState<Settings>();
  const [editingSettings, setEditingSettings] = useState(false);
  const [daysSpanned, firstDate] = useMemo(() => {
    const dates = entries
      .map((e) => e.timestamp)
      .sort((a, b) => b.getTime() - a.getTime());
    return [
      differenceInDays(dates[0], dates[dates.length - 1]),
      dates[dates.length - 1],
    ];
  }, [entries]);

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
            anonymousId: nanoid(),
            startAmount: 0,
            startDate: startOfDay(new Date()),
            dailyBudget: 40,
          };
          plausible.trackEvent(
            "init-app",
            { props: { auid: initSettings.anonymousId } },
            { trackLocalhost: false }
          );
          settingsStore.add(initSettings, "settings").then(() => {
            setSettings(initSettings);
          });
        } else {
          const auid =
            result.anonymousId === undefined || result.anonymousId.length < 1
              ? nanoid()
              : result.anonymousId;

          const normalizedSettings = {
            ...result,
            anonymousId: auid,
            startDate: startOfDay(result.startDate),
          };

          settingsStore.put(normalizedSettings, "settings").then(() => {
            setSettings(normalizedSettings);
          });

          plausible.trackEvent(
            "launch-app",
            { props: { auid: result.anonymousId } },
            { trackLocalhost: false }
          );
        }
      });
    });
  }, []);

  return (
    <main className="w-[100vw] max-w-[600px] overflow-hidden h-[100vh] fixed top-0 left-[50%] translate-x-[-50%]">
      <div className="bg-[#14C31B] h-[60px] items-center text-white p-2 flex justify-center relative">
        <Analytics />
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
        className="h-[50vh] w-full bg-white overflow-y-scroll no-scrollbar  [&>:nth-child(4n_+_1)]:bg-white [&>div]:bg-gray-50"
      >
        {entries
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .map((entry, index, arr) => (
            <Fragment key={entry.id}>
              <div
                key={`entry_${entry.id}`}
                className="flex items-center justify-between px-2 py-1"
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
              <div
                className={`${
                  arr?.[index + 1] === undefined
                    ? "block"
                    : differenceInDays(
                        startOfDay(entry.timestamp),
                        startOfDay(arr[index + 1].timestamp)
                      ) >= 1
                    ? "block"
                    : "hidden"
                } sticky bottom-0 text-center bg-white text-gray-500 text-xs py-2 bg-gradient-to-t from-gray-50 to-white border-b border-gray-200`}
                style={{
                  zIndex:
                    daysSpanned - differenceInDays(firstDate, entry.timestamp),
                }}
              >
                {format(entry.timestamp, "dd MMM yyyy")}
              </div>
            </Fragment>
          ))}
      </div>

      <div className="px-2 py-2 w-full h-[calc(50vh_-_60px)]">
        {editingSettings ? (
          settings === undefined ? (
            <>Loading</>
          ) : (
            <SettingsEditor
              key={JSON.stringify(settings)}
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

                if (settings === undefined) {
                  return;
                }

                plausible.trackEvent(
                  "enter-spend",
                  { props: { auid: settings.anonymousId } },
                  { trackLocalhost: false }
                );
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
        inputMode="decimal"
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
  const [data, setData] = useState<DirtySettings>({
    ...settings,
    dailyBudget: settings.dailyBudget.toFixed(2),
    startAmount: settings.startAmount.toFixed(2),
  });
  const [persisted, setPersisted] = useState(false);
  const [savingSettings, setSavingSettings] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => {
      setSavingSettings(() => true);
      onUpdate({
        anonymousId: data.anonymousId,
        dailyBudget: isNaN(Number(data.dailyBudget))
          ? 0
          : Number(data.dailyBudget),
        startAmount: isNaN(Number(data.startAmount))
          ? 0
          : Number(data.startAmount),
        startDate: data.startDate,
      });
    }, 2000);

    const id2 = setTimeout(() => {
      setSavingSettings(() => false);
    }, 2500);
    return () => {
      clearTimeout(id);
      clearTimeout(id2);
    };
  }, [data]);

  useEffect(() => {
    navigator.storage.persisted().then((v) => setPersisted(v));
  }, []);

  return (
    <div className="flex flex-col py-4 gap-2">
      <div className="flex items-center w-full gap-2">
        <label className="w-24 text-sm">daily budget</label>
        <input
          type="text"
          value={data.dailyBudget}
          inputMode="decimal"
          disabled={savingSettings}
          className="flex-grow p-1 font-mono text-lg text-center border border-gray-400"
          placeholder="daily budget"
          onFocus={(e) => {
            e.target.value = "";
          }}
          onChange={(e) => {
            setData((d) => ({
              ...d,
              dailyBudget: e.target.value,
            }));
          }}
        />
      </div>

      <div className="flex items-center w-full gap-2">
        <label className="w-24 text-sm">start balance</label>
        <input
          placeholder="starting amount"
          type="text"
          disabled={savingSettings}
          className="flex-grow p-1 font-mono text-lg text-center border border-gray-400"
          value={data.startAmount}
          inputMode="decimal"
          onFocus={(e) => {
            e.target.value = "";
          }}
          onChange={(e) => {
            setData((d) => ({
              ...d,
              startAmount: e.target.value,
            }));
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="w-24 text-sm">start date</label>
        <input
          type="date"
          disabled={savingSettings}
          value={format(data.startDate, "yyyy-MM-dd")}
          required={true}
          id="date_input"
          className="flex-grow py-1 text-lg text-center bg-white border border-gray-400"
          onChange={(e) => {
            setData((d) => ({
              ...d,
              startDate: startOfDay(new Date(e.target.value)),
            }));
          }}
        />
      </div>

      <div
        className="p-1 mt-2 text-sm text-center text-gray-400 bg-white border rounded cursor-pointer border-text border-1"
        onClick={async () => {
          if (!persisted) {
            const persistResult = await navigator.storage.persist();
            if (persistResult) {
              setPersisted(true);
            }
          }
        }}
      >
        {persisted
          ? "data persisted in browser"
          : "request persistence in browser"}
      </div>
      {savingSettings && (
        <div className="mt-2 text-center text-gray-400">saving...</div>
      )}
    </div>
  );
};

export default App;
