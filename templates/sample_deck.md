---
title: Slip Demo
theme: clean
size: widescreen
---

<style>
h1 {
  letter-spacing: 0.02em;
}
</style>

# Slip

Browser-native Markdown slides with reliable print export.

- Write Markdown
- Preview fixed-size slides
- Print or save as PDF

???
Speaker notes are written after three question marks.

---

## Images and Code

![Placeholder](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 200'%3E%3Crect width='900' height='280' fill='%23e5f2ef'/%3E%3Ctext x='450' y='100' text-anchor='middle' font-family='Arial' font-size='36' fill='%230f554c'%3EDrop images into the editor%3C/text%3E%3C/svg%3E)

```js
const deck = parseSlides(markdown);
render(deck);
```

---

## Math and Chart

Two-column page with mathematical equations and a simple chart.

:::columns 5:5
:::column
Inline math works: $E = mc^2$

Block math works:
$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

:::column
```slip-chart
type: horizontal-bar
value-per-bar: 5
caption: "Bar Chart (can be empty to hide)" 
data: {"AOA": 30, "B": 50, "C": 20}
```
:::end


---

## Export

Use **Export > PDF** to open the browser print dialog.

The preview is designed as a print page first, then scaled for screen reading.

Use **Export > Embedded** to generate an embedded markdown, where images are encoded into base64 format (only supports small images).

![test-16.png](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA/ElEQVR4nGNgGDTgi7Opx2cns3Ofncx+fHY2ffDZ2azlv709x38LC87Pzqatn53MHoLlIGpCUTU7mid+djb798XZ7D8KdjLb/cXJbA+GOFjONAGs+b29vsAXJ9OPWBXhw05mH965GPMzfHExdSdZMww7mrkxfHYydyXXgM/OJi4ML+3teb44m74j3QDTd/9d9bjB4fDZyTyfZNudzPPhsfC/noHpi5PZWuI1m275HxrKjBKV/32MuT47me0gwum7QGqxJqb/xsasn51MZ+IONNM5/0O12Aimyq9OpoFfnEzfIiWaj5+dTaNJStrfXIzlPjubbQJhEJskzXQFADmjUTkfk+TMAAAAAElFTkSuQmCC){width=10%}

