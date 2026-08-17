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
type CustomOptions = {
    labelSpacing: number;
    maxLabelsPerLine: number;
    rotateToLine: boolean;
    avoidOverlaps: boolean;
};
type ChartController = {
    setMode: (mode: LabelMode) => void;
    setCustomOptions: (options: CustomOptions) => void;
    delete: () => void;
};

const WIDTH = 220;
const HEIGHT = 180;
const LEVELS = [-8, -4, 0, 4, 8, 12, 16, 20];

// One slider step is one complete subdivision level: 2^n labels on loops, 2^n - 1 on open lines.
const MAX_LABELS_OPTIONS = [1, 2, 4, 8, 16, 32, 64];

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
        precision: 0,
        numericFormat: ENumericFormat.Decimal,
        labelSpacing: 50,
        maxLabelsPerLine: 16,
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
        setCustomOptions: ({ labelSpacing, maxLabelsPerLine, rotateToLine, avoidOverlaps }) => {
            afterProvider.labelSpacing = labelSpacing;
            afterProvider.maxLabelsPerLine = maxLabelsPerLine;
            afterProvider.rotateToLine = rotateToLine;
            afterProvider.avoidOverlaps = avoidOverlaps;
        },
        delete: () => sciChartSurface.delete(),
    };
};

export default function App() {
    const [mode, setMode] = useState<LabelMode>("after");
    const [customOptions, setCustomOptions] = useState<CustomOptions>({
        labelSpacing: 50,
        maxLabelsPerLine: 16,
        rotateToLine: true,
        avoidOverlaps: true,
    });
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

    const updateCustomOptions = (updates: Partial<CustomOptions>) => {
        const nextOptions = { ...customOptions, ...updates };
        setCustomOptions(nextOptions);
        chart.current?.setCustomOptions(nextOptions);
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
            <div style={{ position: "relative" }}>
                <div ref={chartElement} />
                {mode === "after" && (
                    <div
                        style={{
                            position: "absolute",
                            bottom: 12,
                            right: 12,
                            display: "grid",
                            gap: 8,
                            padding: 12,
                            color: "#fff",
                            background: "rgba(15, 23, 32, 0.5)",
                            border: "1px solid rgba(255, 255, 255, 0.25)",
                            borderRadius: 6,
                            fontSize: 13,
                            zIndex: 1,
                        }}
                    >
                        <label>
                            Label spacing (px): {customOptions.labelSpacing}
                            <input
                                type="range"
                                min="1"
                                max="300"
                                value={customOptions.labelSpacing}
                                onChange={(event) => updateCustomOptions({ labelSpacing: Number(event.target.value) })}
                                style={{ display: "block" }}
                            />
                        </label>
                        <label>
                            Max labels per line: {customOptions.maxLabelsPerLine}
                            <input
                                type="range"
                                min="0"
                                max={MAX_LABELS_OPTIONS.length - 1}
                                step="1"
                                value={MAX_LABELS_OPTIONS.indexOf(customOptions.maxLabelsPerLine)}
                                onChange={(event) =>
                                    updateCustomOptions({
                                        maxLabelsPerLine: MAX_LABELS_OPTIONS[Number(event.target.value)],
                                    })
                                }
                                style={{ display: "block" }}
                            />
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                checked={customOptions.rotateToLine}
                                onChange={(event) => updateCustomOptions({ rotateToLine: event.target.checked })}
                            />{" "}
                            Rotate labels
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                checked={customOptions.avoidOverlaps}
                                onChange={(event) => updateCustomOptions({ avoidOverlaps: event.target.checked })}
                            />{" "}
                            Avoid overlap
                        </label>
                    </div>
                )}
            </div>
            <p>Zoom in and out with both modes to see the improvement!</p>
        </main>
    );
}
