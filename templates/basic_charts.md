---
title: Slip Basic Charts
theme: paper
size: widescreen
---

<style>
:page-content {
padding-top: 40px;
padding-bottom: 40px;
}
</style>

# Basic Charts

Slip supports two kinds of charts: **basic charts** and **rich charts**. Basic ones are based on ASCII characters, and this template shows some examples of them.

---

## Bar Chart I

A bar chart can be horizontal or vertical. For a horizontal bar chart, the value of each bar needs to be defined, and the actual data value will be rounded (floored). 

For example, if a data point has a value of 38, and the value per bar is 5, then the bar will have 7 bars (38/5 = 7.6, and it will be rounded down to 7). 

It is similar to a vertical bar chart, but the labels can not be longer than 2 characters (for better visualization), and only the first 2 characters will be shown.

---

## Bar Chart II


:::columns 5:5
:::column
```slip-chart
type: horizontal-bar
value-per-bar: 5
caption: "Bar Chart (can be empty to hide)" 
data: {"AOA": 30, "B": 50, "C": 20}
```
:::column
```text
Bar Chart (can be empty to hide)
AOA | ██████ 30
  B | ██████████ 50
  C | ████ 20
```
:::end

At most 50 horizontal bars; if a data point's value requires more than 50 bars, it will be shown as 50 bars followed by "~".

For vertical bars, at most 10 bars; if a data point's value requires more than 10 bars, it will be shown as 10 bars with "~" on top.

---

## Bar Chart III

:::columns 5:5
:::column
```slip-chart
type: vertical-bar
value-per-bar: 10
caption: ""
data: {"AOA": 30, "B": 115, "C": 20}
```
:::column
```text
         ~   
100 |    █    
 90 |    █    
 80 |    █    
 70 |    █    
 60 |    █    
 50 |    █    
 40 |    █    
 30 | █  █    
 20 | █  █  █ 
 10 | █  █  █ 
    +---------
      AO B  C 
```
:::end


---

## Dot Chart

A dot chart is essentially the same as a bar chart, but it uses dots instead of bars. 

:::columns 5:5
:::column

```slip-chart
type: horizontal-point
value-per-point: 10
caption: "Dot Chart."
data: {"A": 30, "C": 20}
```

:::column
```text
Dot Chart.
A | ••• 30
C | •• 20
```
:::end

There is also a vertical one. The same rules apply to the dot chart as to the bar chart, such as the maximum number of dots and the label length for vertical charts.

---

## Progress Bar
A progress bar is a special kind of horizontal bar chart, 

:::columns 5:5
:::column
```slip-chart
type: progress-bar
caption: "Progress"
value-per-bar: 10
data: {"Task 1": 70, "Task 2": 40}
```

:::column
```text
Progress
Task 1   [███████░░░] 70%
Task 2   [████░░░░░░] 40%
```
:::end


The value of each data point is between 0 and 100, and the other rules are the same as a horizontal bar chart. 

---

## Custom Chart
To use custom characters or formats, you can use the "text" type. For example, 

:::columns 5:5
:::column

```text
Matrix heatmap:
      AM PM EV
Mon   ░░ ▒▒ ██
Tue   ▒▒ ▓▓ ██
Wed   ░░ ▓▓ ▓▓

Gantt:
Task A  4.1████████
Task B      5.20███████
Task C          4.23████████
```
:::column
```text
Dotted line chart
 80 |              ●       ●
 70 |              |       |
 60 |          ●   |   ●   |
 50 |          |   |   |   |
 40 |      ●   |   |   |   |
 30 |      |   |   |   |   |
 20 |  ●   |   |   |   |   |
    +----------------------------
      Jan Feb Mar Apr May Jun
```
:::end



