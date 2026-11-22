# MotoRush 3D — 复古街机伪 3D 摩托极速狂飙

<p align="left">
  <a href="https://xiaoa0v0.github.io/MotoRush-3D/" target="_blank">
    <img src="https://img.shields.io/badge/Play%20Now-%E7%82%B9%E5%87%BB%E5%9C%A8%E7%BA%BF%E5%BC%80%E7%8E%A9-ef4444?style=for-the-badge&logo=githubpages&logoColor=white" alt="Play Now" />
  </a>
  <img src="https://img.shields.io/badge/Engine-HTML5%20Canvas%20Pseudo--3D-38bdf8?style=for-the-badge" alt="Pseudo-3D" />
  <img src="https://img.shields.io/badge/Audio-Web%20Audio%20API%20Synth-34d399?style=for-the-badge" alt="Web Audio" />
  <img src="https://img.shields.io/badge/License-MIT-6366f1?style=for-the-badge" alt="License" />
</p>

一款**纯前端、零外部素材依赖**的复古街机风格（OutRun / 湾岸午夜风格）**伪 3D 摩托车竞速小游戏**！所有赛道透视、压弯仿赛与骑手动画、城市/夕阳/山道景观与实时直列四缸换挡声浪均由 **HTML5 Canvas + Web Audio API** 实时程序化生成。

🏍️ **立即在线开玩（GitHub Pages）**：https://xiaoa0v0.github.io/MotoRush-3D/

---

## ✨ 游戏特色

- **🛣️ 纯手写伪 3D 透视公路引擎**：支持连续大弯道离心力、起伏陡坡遮挡裁剪（Z-Buffer Clipping）、高速龙门架、霓虹路灯、海景棕榈与山道发卡弯导向牌。
- **🏍️ 三条风格迥异的特色赛道**：
  1. 🌃 **东京湾岸午夜**：赛博霓虹高架桥、蓝紫都市天际线、高密度车流穿插。
  2. 🌅 **太平洋日落海岸**：Synthwave 橘红落日、海景棕榈、高速畅跑。
  3. ⛰️ **秋名山午夜山道**：大幅度起伏陡坡与连续发卡急弯，考验压弯控车。
- **⚡ 贴身擦车连击 + NOS 氮气冲刺**：
  - 高速贴身超越社会车辆触发 **Near-Miss 连击加分** 并即时补充 NOS 氮气槽！
  - 开启 **NOS 氮气加速**（`Space` / `Shift`）时双边钛合金排气管喷射蓝色火焰、四周迸发放射速度线，突破 `320+ km/h`！
- **🔊 6 速波箱 + Web Audio 实时声浪**：
  - 实时跟随 6 速波箱与 `16,500 RPM` 转速表动态合成四缸机咆哮声、自动升档快排回火音、风噪、擦车提示音与检查点加时音效。
- **📱 桌面键盘 + 手机触屏全适配**：内置本地最高分排行榜（`localStorage`），下载离线包双击 `index.html` 即可无网畅玩。

---

## 🎮 操作说明

| 按键 | 功能 |
| :---: | :--- |
| `W` / `↑` | 油门加速 |
| `S` / `↓` | 刹车减速（尾灯高亮） |
| `A` `D` / `←` `→` | 左右压弯变道 |
| `Space` / `Shift` | NOS 氮气加速喷射 |
| `P` / `Esc` | 暂停 / 继续游戏 |
| `M` | 开关实时合成声浪 |

---

## 🚀 本地离线运行

```bash
git clone https://github.com/xiaoA0v0/MotoRush-3D.git
```

直接用浏览器双击打开 `index.html` 即可开始比赛，无需安装任何依赖。

---

## 📄 开源协议

本项目基于 [MIT License](./LICENSE) 开源。
