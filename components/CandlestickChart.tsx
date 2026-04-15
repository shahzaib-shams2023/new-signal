import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { Candle, ScreenerAnalysis } from '../types';

interface ChartProps {
  data: Candle[];
  structure?: ScreenerAnalysis;
  width: number;
  height: number;
  theme: 'dark' | 'light';
  symbol: string;
}

const formatChartPrice = (p: number) => {
  if (p === 0) return '0.00';
  if (Math.abs(p) < 1) return d3.format(".8f")(p);
  if (Math.abs(p) < 100) return d3.format(".4f")(p);
  return d3.format(",.2f")(p);
};

const CandlestickChart: React.FC<ChartProps> = ({ data, structure, width, height, theme, symbol }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const isDark = theme === 'dark';
    const gridColor = isDark ? "#2b3139" : "#e0e3e7";
    const textColor = isDark ? "#848e9c" : "#707a8a";

    const margin = { top: 40, right: 90, bottom: 40, left: 10 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
      .domain(data.map(d => d.time.toString()))
      .range([0, chartWidth])
      .padding(0.35);

    const yMin = d3.min(data, d => d.low) || 0;
    const yMax = d3.max(data, d => d.high) || 0;
    const yPadding = (yMax - yMin) * 0.15;

    const y = d3.scaleLinear()
      .domain([yMin - yPadding, yMax + yPadding])
      .range([chartHeight, 0]);

    // Watermark
    g.append("text")
      .attr("x", chartWidth / 2)
      .attr("y", chartHeight / 2)
      .attr("text-anchor", "middle")
      .attr("font-size", Math.min(chartWidth / 6, 80))
      .attr("font-weight", "900")
      .attr("fill", isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)")
      .attr("pointer-events", "none")
      .text(symbol.replace('USDT', ''));

    // Grid lines
    g.append("g")
      .attr("stroke", gridColor)
      .attr("stroke-opacity", isDark ? 0.2 : 0.5)
      .call(d3.axisLeft(y).tickSize(-chartWidth).tickFormat(() => ""));

    // Draw Candles
    const candles = g.selectAll(".candle")
      .data(data)
      .enter().append("g");

    candles.append("line")
      .attr("x1", d => (x(d.time.toString()) || 0) + x.bandwidth() / 2)
      .attr("x2", d => (x(d.time.toString()) || 0) + x.bandwidth() / 2)
      .attr("y1", d => y(d.high))
      .attr("y2", d => y(d.low))
      .attr("stroke", d => d.close > d.open ? "#10b981" : "#ef4444")
      .attr("stroke-width", 1.2);

    candles.append("rect")
      .attr("x", d => x(d.time.toString()) || 0)
      .attr("y", d => y(Math.max(d.open, d.close)))
      .attr("width", x.bandwidth())
      .attr("height", d => Math.max(1, Math.abs(y(d.open) - y(d.close))))
      .attr("fill", d => d.close > d.open ? "#10b981" : "#ef4444")
      .attr("rx", 1);

    // Pivot High/Low Markers
    if (structure) {
      const drawPivot = (val: number, label: string, color: string) => {
        const py = y(val);
        g.append("line")
          .attr("x1", 0).attr("x2", chartWidth)
          .attr("y1", py).attr("y2", py)
          .attr("stroke", color)
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "2,4")
          .attr("opacity", 0.6);

        g.append("text")
          .attr("x", chartWidth + 5)
          .attr("y", py + 3)
          .attr("fill", color)
          .attr("font-size", "9px")
          .attr("font-weight", "bold")
          .text(label);
      };
      if (structure.lastPivotHigh) drawPivot(structure.lastPivotHigh, 'P.HIGH', '#ef4444');
      if (structure.lastPivotLow) drawPivot(structure.lastPivotLow, 'P.LOW', '#10b981');
    }

    // Current price tag
    const last = data[data.length - 1];
    if (last) {
      const ly = y(last.close);
      const color = last.close >= last.open ? "#10b981" : "#ef4444";
      const liveG = g.append("g");
      
      liveG.append("line")
        .attr("x1", 0).attr("x2", chartWidth)
        .attr("y1", ly).attr("y2", ly)
        .attr("stroke", color)
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2,2");

      const liveTag = liveG.append("g").attr("transform", `translate(${chartWidth}, ${ly - 9})`);
      liveTag.append("rect").attr("width", 85).attr("height", 18).attr("fill", color).attr("rx", 1);
      liveTag.append("text")
        .attr("x", 4)
        .attr("y", 13)
        .attr("fill", "white")
        .attr("font-size", "9px")
        .attr("font-weight", "bold")
        .attr("font-family", "JetBrains Mono")
        .text(formatChartPrice(last.close));
    }

    // Axes
    g.append("g")
      .attr("transform", `translate(${chartWidth},0)`)
      .call(d3.axisRight(y).ticks(8).tickFormat(d => formatChartPrice(d as number)))
      .attr("color", textColor)
      .selectAll("text").attr("font-family", "JetBrains Mono").attr("font-size", "10px");

    g.append("g")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x).tickValues(x.domain().filter((d, i) => i % 15 === 0))
      .tickFormat(d => new Date(parseInt(d)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })))
      .attr("color", textColor)
      .selectAll("text").attr("font-family", "JetBrains Mono").attr("font-size", "10px");

  }, [data, structure, width, height, theme, symbol]);

  return <svg ref={svgRef} width={width} height={height} className="overflow-visible select-none transition-colors duration-300 cursor-crosshair" />;
};

export default CandlestickChart;