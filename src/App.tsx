import { useEffect, useRef, useState } from "react";
import {
    ContoursDataLabelProvider,
    CursorModifier,
    ENumericFormat,
    HeatmapColorMap,
    MouseWheelZoomModifier,
    NumericAxis,
    SciChartSurface,
    UniformContoursRenderableSeries,
    UniformHeatmapDataSeries,
    UniformHeatmapRenderableSeries,
    ZoomExtentsModifier,
    ZoomPanModifier,
} from "scichart";
import { AlongLineContoursDataLabelProvider } from "./contours/AlongLineContoursDataLabelProvider";

type LabelMode = "before" | "after";
type ChartController = { setMode: (mode: LabelMode) => void; delete: () => void };

const WIDTH = 220;
const HEIGHT = 180;
const LEVELS = [-8, -4, 0, 4, 8, 12, 16, 20];
const gradientStops = [
    { offset: 0, color: "#172554" },
    { offset: 0.25, color: "#075985" },
    { offset: 0.5, color: "#0f766e" },
    { offset: 0.72, color: "#f59e0b" },
    { offset: 1, color: "#fef3c7" },
];

const makeTerrain = (): number[][] =>
    Array.from({ length: HEIGHT }, (_, row) =>
        Array.from({ length: WIDTH }, (_, column) => {
            const x = -4 + (column / (WIDTH - 1)) * 8;
            const y = -3.2 + (row / (HEIGHT - 1)) * 6.4;
            const leftPeak = 18 * Math.exp(-((x + 1.35) ** 2 / 1.2 + (y + 0.55) ** 2 / 0.9));
            const rightPeak = 13 * Math.exp(-((x - 1.55) ** 2 / 1.4 + (y - 0.85) ** 2 / 1.1));
            const ridge = 2.5 * Math.sin(x * 1.4) * Math.cos(y * 1.1);
            return leftPeak + rightPeak + ridge - 0.65 * (x * x + y * y);
        }),
    );

const createChart = async (element: HTMLDivElement): Promise<ChartController> => {
    const { sciChartSurface, wasmContext } = await SciChartSurface.create(element, { widthAspect: 1.6 });
    sciChartSurface.xAxes.add(new NumericAxis(wasmContext, { axisTitle: "longitude" }));
    sciChartSurface.yAxes.add(new NumericAxis(wasmContext, { axisTitle: "latitude" }));

    const dataSeries = new UniformHeatmapDataSeries(wasmContext, {
        xStart: -4,
        xStep: 8 / (WIDTH - 1),
        yStart: -3.2,
        yStep: 6.4 / (HEIGHT - 1),
        zValues: makeTerrain(),
    });
    const colorMap = new HeatmapColorMap({ minimum: -12, maximum: 20, gradientStops });

    sciChartSurface.renderableSeries.add(
        new UniformHeatmapRenderableSeries(wasmContext, { dataSeries, colorMap, opacity: 0.72 }),
    );

    const contourSeries = new UniformContoursRenderableSeries(wasmContext, {
        dataSeries,
        zLevels: LEVELS,
        stroke: "#dbeafe",
        strokeThickness: 2,
        majorLineStyle: { strokeThickness: 2, color: "#f8fafc" },
        minorLineStyle: { strokeThickness: 1, color: "#93c5fd" },
        dataLabels: {
            color: "#f8fafc",
            style: { fontSize: 13 },
            precision: 1,
            numericFormat: ENumericFormat.Decimal,
            labelRowCount: 10,
        },
    });
    const beforeProvider = contourSeries.dataLabelProvider as ContoursDataLabelProvider;
    const afterProvider = new AlongLineContoursDataLabelProvider({
        color: "#f8fafc",
        style: { fontSize: 13 },
        precision: 1,
        numericFormat: ENumericFormat.Decimal,
        labelSpacing: 120,
        maxLabelsPerLine: 9,
        rotateToLine: true,
        avoidOverlaps: true,
    });
    sciChartSurface.renderableSeries.add(contourSeries);
    sciChartSurface.chartModifiers.add(
        new ZoomPanModifier(),
        new MouseWheelZoomModifier(),
        new ZoomExtentsModifier(),
        new CursorModifier({ showTooltip: true, includedSeriesIds: [contourSeries.id] }),
    );
    sciChartSurface.zoomExtents();

    return {
        setMode: (mode) => {
            contourSeries.dataLabelProvider = mode === "before" ? beforeProvider : afterProvider;
            sciChartSurface.invalidateElement();
        },
        delete: () => sciChartSurface.delete(),
    };
};

export default function App() {
    const [mode, setMode] = useState<LabelMode>("after");
    const chartElement = useRef<HTMLDivElement>(null);
    const chart = useRef<ChartController | undefined>(undefined);

    useEffect(() => {
        let disposed = false;
        if (!chartElement.current) return;
        createChart(chartElement.current).then((controller) => {
            if (disposed) controller.delete();
            else {
                chart.current = controller;
                controller.setMode(mode);
            }
        });
        return () => {
            disposed = true;
            chart.current?.delete();
            chart.current = undefined;
        };
    }, []);

    const selectMode = (nextMode: LabelMode) => {
        setMode(nextMode);
        chart.current?.setMode(nextMode);
    };

    return (
        <main>
            <h1>Along-line contour labels</h1>
            <p>Uniform heatmap contour label comparison.</p>
            <p>
                <button
                    type="button"
                    aria-pressed={mode === "before"}
                    onClick={() => selectMode("before")}
                    style={{
                        background: mode === "before" ? "#111" : "#fff",
                        color: mode === "before" ? "#fff" : "#111",
                    }}
                >
                    default
                </button>{" "}
                <button
                    type="button"
                    aria-pressed={mode === "after"}
                    onClick={() => selectMode("after")}
                    style={{
                        background: mode === "after" ? "#111" : "#fff",
                        color: mode === "after" ? "#fff" : "#111",
                    }}
                >
                    (custom) AlongLineContoursDataLabelProvider
                </button>
            </p>
            <div ref={chartElement} />
            <p>Zoom in and out with both modes to see the improvement!</p>
        </main>
    );
}
