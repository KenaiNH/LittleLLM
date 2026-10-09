# Showing the companion on all Windows desktops

Automatic pinning is deferred for this release. The General setting is disabled; its retained config value does not pin a Windows window.

1. Open LittleLLM Settings from the tray icon or the sprite's context menu.
2. In General → Startup, enable **Show in taskbar**.
3. Press **Win + Tab** to open Windows Task View. Make sure the companion is visible rather than hidden in the tray.
4. Right-click the LittleLLM companion's window thumbnail and select **Show this window on all desktops**. Selecting **Show windows from this app on all desktops** also includes Settings and the response input.
5. Switch desktops and check the placement. Uncheck the same Task View option to undo pinning.

Windows owns this choice. You may need to repeat it after LittleLLM restarts or recreates its window. The app does not store or restore Task View pinning.

Microsoft documents [Task View and desktop management](https://support.microsoft.com/en-us/windows/experience/configure-multiple-desktops-in-windows); its [pinning instructions](https://learn.microsoft.com/en-ca/answers/questions/2153315/how-do-i-enable-windows-11s-virtual-desktop-featur) describe the window's all-desktops option. Automatic pinning would require a separate future integration; see DISCREPANCIES entry 40.
