import { dayjs } from "react-declarative";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

import isToday from "dayjs/plugin/isToday";
import localeData from "dayjs/plugin/localeData";
import utc from "dayjs/plugin/utc";
import timezone from 'dayjs/plugin/timezone';

import enLocale from "dayjs/locale/en-gb";
import ruLocale from "dayjs/locale/ru";
import trLocale from "dayjs/locale/tr";
import zhLocale from "dayjs/locale/zh-cn";
import hiLocale from "dayjs/locale/hi";
import esLocale from "dayjs/locale/es";
import ptLocale from "dayjs/locale/pt";

import { getLocale } from "../i18n";
import { localeChangedSubject } from "../i18n/tools/t";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Title,
  Tooltip,
  Legend,
);

// Ключи совпадают с localeMap из i18n, значения - соответствующие
// локали dayjs (en -> en-gb, zh -> zh-cn).
const dayjsLocaleMap = {
  en: enLocale,
  ru: ruLocale,
  tr: trLocale,
  zh: zhLocale,
  hi: hiLocale,
  es: esLocale,
  pt: ptLocale,
};

{
  dayjs.extend(localeData);
  dayjs.extend(utc);
  dayjs.extend(isToday);
  dayjs.extend(timezone);
}

const applyLocale = () => {
  dayjs.locale(dayjsLocaleMap[getLocale()] || enLocale);
}

{
  applyLocale();
  localeChangedSubject.subscribe(applyLocale);
}
