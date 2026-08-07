import {
  Breadcrumbs2,
  Breadcrumbs2Type,
  FieldType,
  IBreadcrumbs2Action,
  IBreadcrumbs2Option,
  OneButton,
  pickDocuments,
  Subject,
  TypedField,
  useActualState,
  useActualValue,
  useAsyncAction,
  useOffsetPaginator,
  useOne,
  VirtualView,
} from "react-declarative";
import IconWrapper from "../../../components/common/IconWrapper";
import { Download, FilterList, KeyboardArrowLeft, Refresh, Search } from "@mui/icons-material";
import { Container } from "@mui/material";
import ioc from "../../../lib";
import { ILogEntry } from "backtest-kit";
import { CC_LIST_BUFFER_SIZE } from "../../../config/params";
import LogCard from "./components/LogCard";
import { t } from "../../../i18n";
import { str } from "functools-kit";
import { defaultSlots } from "../../../components/OneSlotFactory";

/**
 * Log levels available for filtering, mirroring ILogEntry["type"].
 * The empty value clears the filter and shows every level.
 */
const LEVEL_FILTERS = [
  { level: "filter-all", type: "", label: t("All levels") },
  { level: "filter-log", type: "log", label: t("Log") },
  { level: "filter-debug", type: "debug", label: t("Debug") },
  { level: "filter-info", type: "info", label: t("Info") },
  { level: "filter-warn", type: "warn", label: t("Warn") },
  { level: "filter-agent", type: "agent", label: t("Agent") },
] as const;

const LOG_NAME_BY_LEVEL = new Map<string, string>(
  LEVEL_FILTERS.map(({ level, label }) => [level, label]),
);

/**
 * Maps the combo value (an action id such as `filter-agent`) to the matching
 * ILogEntry["type"]. The `filter-all` entry maps to an empty string, which the
 * paginator treats as "no level filter".
 */
const LOG_TYPE_BY_LEVEL = new Map<string, ILogEntry["type"] | "">(
  LEVEL_FILTERS.map(({ level, type }) => [level, type]),
);

/**
 * Maps the active ILogEntry["type"] to its human label. Keyed by log type
 * rather than action id, as the breadcrumb payload carries the type itself.
 */
const LOG_NAME_BY_TYPE = new Map<string, string>(
  LEVEL_FILTERS.map(({ type, label }) => [type, label]),
);

const fields: TypedField[] = [
  {
    type: FieldType.Box,
    sx: {
      minWidth: "256px",
    },
    fields: [
      {
        type: FieldType.Combo,
        fieldRightMargin: "0",
        noDeselect: true,
        name: "log_level",
        placeholder: t("Choose"),
        title: "",
        itemList: LEVEL_FILTERS.map(({ level }) => level),
        tr: (level) => LOG_NAME_BY_LEVEL.get(level) || level,
        defaultValue: "filter-all",
      },
      {
        type: FieldType.Typography,
        fieldRightMargin: "0",
        typoVariant: "body2",
        style: {
          opacity: 0.5,
        },
        placeholder: str.newline(
          t("The AGENT level carries directives the strategy addressed to the AI agent via Log.agent(...), such as a stagnating position or collapsed volatility."),
          t("Unlike LOG, DEBUG, INFO and WARN, which the strategy writes for you to read, these entries are fed to the agent as instructions from the trading system."),
        ),
      }
    ]
  }
];

const actions: IBreadcrumbs2Action[] = [
  {
    action: "download-action",
    label: t("Download"),
    icon: () => <IconWrapper icon={Download} color="#4caf50" />
  },
  {
    action: "log-level",
    label: t("Log level"),
    icon: () => <IconWrapper icon={FilterList} color="#4caf50" />
  },
  {
    divider: true,
  },
  {
    action: "update-now",
    label: t("Refresh manually"),
    icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
  },
];

const options: IBreadcrumbs2Option[] = [
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    label: <KeyboardArrowLeft sx={{ display: "block" }} />,
  },
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    label: t("Main"),
  },
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    label: t("Logs"),
  },
  {
    type: Breadcrumbs2Type.Link,
    action: "back-action",
    compute: (payload) => LOG_NAME_BY_TYPE.get(payload) || t("All levels"),
  },
  {
    type: Breadcrumbs2Type.Button,
    icon: Search,
    action: "search-action",
    label: t("Search"),
  },
  {
    type: Breadcrumbs2Type.Fab,
    action: "update-now",
    icon: Refresh,
  },
  {
    type: Breadcrumbs2Type.Fab,
    action: "log-level",
    icon: FilterList,
  },
];

const reloadSubject = new Subject<void>();

export const LogPage = () => {

  const [filterData$, setFilterData] = useActualState("");
  const [levelData$, setLevelData] = useActualState<ILogEntry["type"] | "">("");

  const { data, hasMore, loading, onSkip } = useOffsetPaginator({
    handler: async (limit, offset) => {
      const logList = await ioc.logViewService.getList();
      const iter = pickDocuments<ILogEntry>(limit, offset);
      const filterRegExp = new RegExp(filterData$.current, "i");
      for (const log of logList) {
        if (levelData$.current && log.type !== levelData$.current) {
          continue;
        }
        if (!filterRegExp.test(log.topic)) {
          continue;
        }
        if (iter([log]).done) {
          break;
        }
      }
      return iter().rows;
    },
    onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
    onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
    reloadSubject,
  });

  const pickOne = useOne({
    title: t("Log level"),
    slots: defaultSlots,
    fields,
  });

  const data$ = useActualValue(data);

  const { execute: handleDownload } = useAsyncAction(async () => {
    const blob = new Blob([JSON.stringify(data$.current, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, `logs_${Date.now()}.json`);
  }, {
    onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
    onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
  });

  const handleSearch = async () => {
    const prompt = await ioc.layoutService.prompt(t("Search keyword"));
    if (prompt) {
      setFilterData(prompt);
      reloadSubject.next();
      return;
    }
    setFilterData("");
    reloadSubject.next();
  }

  const handleLevel = async () => {
    const activeLevel = LEVEL_FILTERS.find(
      ({ type }) => type === levelData$.current,
    );
    const logLevel = await pickOne({
      handler: () => ({ log_level: [activeLevel?.level || "filter-all"] }),
    }).toPromise();
    if (!logLevel) {
      return;
    }
    setLevelData(LOG_TYPE_BY_LEVEL.get(logLevel.log_level) || "");
    await reloadSubject.next();
  }

  const handleAction = async (action: string) => {
    if (action === "back-action") {
      ioc.routerService.push("/");
    }
    if (action === "download-action") {
      handleDownload();
    }
    if (action === "update-now") {
      setFilterData("");
      setLevelData("");
      await reloadSubject.next();
    }
    if (action === "search-action") {
      handleSearch();
    }
    if (action === "log-level") {
      handleLevel();
    }
  }

  return (
    <Container>
      <Breadcrumbs2
        items={options}
        actions={actions}
        payload={levelData$.current}
        onAction={handleAction}
      />
       <VirtualView
        sx={{ height: "calc(100vh - 155px)" }}
        withScrollbar
        minHeight={72}
        loading={loading}
        onDataRequest={onSkip}
        bufferSize={CC_LIST_BUFFER_SIZE}
        hasMore={hasMore}
      >
        {data.map((item) => (
          <LogCard
            data={item}
            key={item.id}
            sx={{
              mb: 1,
            }}
          />
        ))}
      </VirtualView>
    </Container>
  );
};

export default LogPage;
