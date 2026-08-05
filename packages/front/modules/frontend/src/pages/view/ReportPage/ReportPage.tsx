import {
    IOutlet,
    ITabsStep,
    TabsView,
    History,
    ITabsOutlet,
} from "react-declarative";
import { Container } from "@mui/material";
import hasRouteMatch from "../../../utils/hasRouteMatch";

import Navigation from "./components/Navigation";
import BacktestView from "./view/BacktestView";
import LiveView from "./view/LiveView";
import ioc from "../../../lib";
import { t } from "../../../i18n";
import { Background } from "../../../components/common/Background";

const routes: ITabsOutlet[] = [

    {
        id: "backtest",
        element: BacktestView,
        isActive: (pathname) => hasRouteMatch(["/report"], pathname),
    },
    {
        id: "backtest",
        element: BacktestView,
        isActive: (pathname) => hasRouteMatch(["/report/backtest"], pathname),
    },
    {
        id: "live",
        element: LiveView,
        isActive: (pathname) => hasRouteMatch(["/report/live"], pathname),
    },
];

const tabs: ITabsStep[] = [
    {
        id: "backtest",
        label: t("Backtest"),
    },
    {
        id: "live",
        label: t("Live"),
    },
];

export const ReportPage = () => {

    const handleTabChange = (id: string, history: History) => {
        if (id === "backtest") {
            history.replace(`/report/backtest`);
        }
        if (id === "live") {
            history.replace(`/report/live`);
        }
    };

    return (
        <Container>
            <TabsView
                withScroll
                sx={{
                    height: "calc(100vh - 105px)",
                }}
                BeforePaper={Navigation}
                onLoadStart={() => ioc.layoutService.setAppbarLoader(true)}
                onLoadEnd={() => ioc.layoutService.setAppbarLoader(false)}
                routes={routes}
                tabs={tabs}
                history={ioc.routerService}
                onTabChange={handleTabChange}
            />
            <Background />
        </Container>
    );
};

export default ReportPage;
