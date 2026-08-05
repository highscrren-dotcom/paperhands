import {
    Box,
    Button,
    ButtonBase,
    Chip,
    darken,
    getContrastRatio,
    lighten,
    Stack,
    Typography,
} from "@mui/material";
import {
    Center,
    FieldType,
    One,
    TypedField,
    typo,
    useAsyncValue,
    useOnce,
    useReloadTrigger,
    ITabsOutletProps,
} from "react-declarative";
import actionSubject from "../config/actionSubject";
import { makeStyles } from "../../../../styles";
import ioc from "../../../../lib";
import IconPhoto from "../../../../components/common/IconPhoto";
import useMarkdownReportView from "../../../../hooks/useMarkdownReportView";
import { t } from "../../../../i18n";

const GROUP_HEADER = "backtest-kit__groupHeader";
const GROUP_ROOT = "backtest-kit__groupRoot";

const ICON_ROOT = "backtest-kit__symbolImage";

const useStyles = makeStyles()({
    root: {
        [`& .${GROUP_ROOT}:hover .${GROUP_HEADER}`]: {
            opacity: "1 !important",
        },
    },
});

interface IRoute {
    label: string;
    symbol: string;
    color: string;
    id: string;
    type: "backtest" | "live";
}

function isLightColor(hex: string) {
    const contrastWithBlack = getContrastRatio(hex, "#000000");
    const contrastWithWhite = getContrastRatio(hex, "#FFFFFF");
    return contrastWithBlack > contrastWithWhite;
}

const createButton = (
    id: string,
    type: "backtest" | "live",
    symbol: string,
    label: React.ReactNode,
    color: string,
): TypedField => ({
    type: FieldType.Component,
    desktopColumns: "6",
    tabletColumns: "6",
    phoneColumns: "12",
    fieldRightMargin: "1",
    fieldBottomMargin: "1",
    element: ({ payload }) => (
        <Button
            component={ButtonBase}
            onClick={() => {
                payload.handleOpen(id, type);
            }}
            sx={{
                width: "100%",
                background: color,
                color: "white",
                fontWeight: "bold",
                fontSize: "14px",
                height: "75px",
                minHeight: "75px",
                textWrap: "wrap",
                padding: "16px",
                [`& .${ICON_ROOT}`]: {
                    transition: "filter 500ms",
                },
                "&:hover": {
                    background: () =>
                        isLightColor(color)
                            ? darken(color, 0.33)
                            : lighten(color, 0.33),
                    [`& .${ICON_ROOT}`]: {
                        transition: "filter 500ms",
                        filter: isLightColor(color)
                            ? "brightness(0.7) contrast(1.2)"
                            : "brightness(1.3) contrast(0.5)",
                    },
                },
                transition: "background 500ms",
            }}
            startIcon={<IconPhoto className={ICON_ROOT} symbol={symbol} />}
        >
            <Box
                sx={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    width: "75px",
                }}
            >
                {label}
            </Box>
        </Button>
    ),
});

const createGroup = (
    label: string,
    routes: IRoute[],
    hideHeader = false,
): TypedField => ({
    type: FieldType.Group,
    className: GROUP_ROOT,
    sx: {
        p: 2,
    },
    tabletColumns: "12",
    desktopColumns: "3",
    fields: [
        {
            type: FieldType.Component,
            className: GROUP_HEADER,
            style: {
                transition: "opacity 500ms",
                opacity: 0.5,
            },
            element: () => (
                <Stack
                    direction="row"
                    sx={{ visibility: hideHeader ? "hidden" : "visible" }}
                >
                    <Chip
                        variant="outlined"
                        size="small"
                        color="info"
                        label={`${typo.bullet} ${label}`}
                        sx={{
                            mb: 1,
                            pr: 0.5,
                            fontSize: "14px",
                            background: "white",
                            cursor: "not-allowed",
                        }}
                    />
                    <Box flex={1} />
                </Stack>
            ),
        },
        {
            type: FieldType.Group,
            fields: routes.map(({ symbol, label, id, type, color }) =>
                createButton(id, type, symbol, label, color),
            ),
        },
    ],
});

// Группа шириной desktopColumns="3" вмещает два символа в ряд, то есть
// CHUNK_SIZE символов дают ровно два ряда. Стратегию с большим числом
// символов режем на несколько групп с одним именем - они встают в строку
// рядом друг с другом вместо одного длинного столбца.
const CHUNK_SIZE = 4;

// Сколько групп шириной desktopColumns="3" помещается в один ряд сетки.
const GROUPS_PER_ROW = 4;

const chunkRoutes = (routes: IRoute[]) => {
    const chunks: IRoute[][] = [];
    for (let i = 0; i < routes.length; i += CHUNK_SIZE) {
        chunks.push(routes.slice(i, i + CHUNK_SIZE));
    }
    return chunks;
};

// Пустая ячейка-распорка: добивает ряд до конца, чтобы следующая
// стратегия начиналась с новой строки и её куски не разрывались.
const createSpacer = (): TypedField => ({
    type: FieldType.Component,
    desktopColumns: "3",
    tabletColumns: "12",
    element: () => null,
});

/**
 * Раскладывает стратегии одной секции: на планшете - две колонки по 6,
 * на десктопе - общий ряд на 12 колонок, где каждая стратегия нарезана
 * на куски по CHUNK_SIZE символов и добита распорками до конца ряда.
 * Возвращает пустой массив, если в секции нет стратегий, чтобы её
 * заголовок не отрисовался в одиночку.
 */
const createSectionFields = (groups: Record<string, IRoute[]>): TypedField[] => {
    const sortedGroups = Object.entries(groups).sort(
        ([, a], [, b]) => b.length - a.length,
    );

    if (!sortedGroups.length) {
        return [];
    }

    const tabletLeftColumn: TypedField[] = [];
    const tabletRightColumn: TypedField[] = [];
    const wideColumn: TypedField[] = [];

    sortedGroups.forEach(([strategy, routes], idx) => {
        // На планшете группа занимает всю ширину колонки, резать нечего.
        if (idx % 2 === 0) {
            tabletLeftColumn.push(createGroup(strategy, routes));
        } else {
            tabletRightColumn.push(createGroup(strategy, routes));
        }

        const chunks = chunkRoutes(routes);

        chunks.forEach((chunk, chunkIdx) => {
            // Имя стратегии показываем только над первым куском, у остальных
            // заголовок скрыт, но занимает место - чтобы ряды кнопок
            // выравнивались по одной линии.
            wideColumn.push(createGroup(strategy, chunk, chunkIdx > 0));
        });

        // Добиваем незаконченный ряд, иначе следующая стратегия влезет
        // в остаток текущего и разорвётся между строками.
        const tail = chunks.length % GROUPS_PER_ROW;
        if (tail !== 0) {
            for (let i = tail; i < GROUPS_PER_ROW; i++) {
                wideColumn.push(createSpacer());
            }
        }
    });

    return [
        {
            type: FieldType.Group,
            columns: "6",
            className: "tabletLeftColumn",
            phoneHidden: true,
            desktopHidden: true,
            fields: tabletLeftColumn,
        },
        {
            type: FieldType.Group,
            columns: "6",
            className: "tabletRightColumn",
            phoneHidden: true,
            desktopHidden: true,
            fields: tabletRightColumn,
        },
        {
            type: FieldType.Group,
            columns: "12",
            className: "wideColumn",
            tabletHidden: true,
            fields: wideColumn,
        },
    ];
};

const createFields = async (): Promise<TypedField[]> => {
    const [symbolMap, itemList] = await Promise.all([
        ioc.symbolGlobalService.getSymbolMap(),
        ioc.liveGlobalService.list(),
    ]);

    const groups: Record<string, IRoute[]> = {};

    itemList.forEach((item) => {
        const symbolData = symbolMap[item.symbol];
        const strategy = item.strategyName;
        if (!groups[strategy]) {
            groups[strategy] = [];
        }
        groups[strategy].push({
            symbol: item.symbol,
            label: symbolData?.displayName || item.symbol,
            color: symbolData?.color || "#ccc",
            type: "live",
            id: item.id,
        });
    });

    return createSectionFields(groups);
};

export const LiveView = ({
    setLoading,
}: ITabsOutletProps) => {
    const { classes } = useStyles();

    const { reloadTrigger, doReload } = useReloadTrigger();

    const [fields, { loading }] = useAsyncValue(
        async () => {
            return await createFields();
        },
        {
            onLoadStart: () => setLoading(true),
            onLoadEnd: () => setLoading(false),
            deps: [reloadTrigger],
        },
    );

    useOnce(() =>
        actionSubject.subscribe((action) => {
            if (action === "back-action") {
                ioc.routerService.push("/");
            }
            if (action === "update-now") {
                doReload();
            }
        }),
    );

    const openMarkdownReport = useMarkdownReportView();

    const handleOpen = (id: string, type: "backtest" | "live") => {
        openMarkdownReport(id, type);
    };

    const renderInner = () => {
        if (loading || !fields) {
            return (
                <Center sx={{ height: "100%" }}>
                    <Typography variant="h6" sx={{ opacity: 0.5 }}>
                        {t("Loading...")}
                    </Typography>
                </Center>
            );
        }

        if (!fields.length) {
            return (
                <Center sx={{ height: "100%" }}>
                    <Typography variant="h6" sx={{ opacity: 0.5 }}>
                        {t("No pending signals")}
                    </Typography>
                </Center>
            );
        }

        return (
            <>
                <One
                    key={reloadTrigger}
                    className={classes.root}
                    fields={fields}
                    payload={() => ({
                        handleOpen,
                    })}
                />
                <Box paddingBottom="24px" />
            </>
        );
    };

    return renderInner();
};

export default LiveView;
