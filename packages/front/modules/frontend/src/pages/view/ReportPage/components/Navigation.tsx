import {
    Breadcrumbs2,
    Breadcrumbs2Type,
    IBreadcrumbs2Option,
    IBreadcrumbs2Action,
} from "react-declarative";
import actionSubject from "../config/actionSubject";
import { KeyboardArrowLeft, Refresh } from "@mui/icons-material";
import IconWrapper from "../../../../components/common/IconWrapper";
import { t } from "../../../../i18n";

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
        label: t("Markdown Report"),
    },
    {
        type: Breadcrumbs2Type.Button,
        action: "update-now",
        label: t("Refresh"),
        icon: Refresh,
    },
];

const actions: IBreadcrumbs2Action[] = [
    {
        action: "update-now",
        label: t("Refresh"),
        icon: () => <IconWrapper icon={Refresh} color="#4caf50" />,
    },
];

export const Navigation = () => (
    <Breadcrumbs2
        items={options}
        actions={actions}
        onAction={actionSubject.next}
    />
);

export default Navigation;
