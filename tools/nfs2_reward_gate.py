"""Arabic quiz gate for timed Need for Speed II SE play sessions.

This is intentionally a small desktop wrapper. It does not modify NFS2,
reimplement driving, or inspect game memory. It only starts the chosen
executable, grants play time after a quiz round, and suspends/resumes the
game process when the time budget changes.

Windows is required because process suspension uses ntdll.
"""

from __future__ import annotations

import ctypes
import os
import subprocess
import sys
import tkinter as tk
from dataclasses import dataclass
from pathlib import Path
from random import sample, shuffle
from tkinter import messagebox


# Configure these before running.
NFS_EXE = Path(os.environ.get("NFS_EXE", r"C:\Games\NFSIISE\nfs2se.exe"))
NFS_WORKDIR = Path(os.environ.get("NFS_WORKDIR", str(NFS_EXE.parent)))
NFS_ARGS = os.environ.get("NFS_ARGS", "").split()

QUESTIONS_PER_ROUND = 5


@dataclass(frozen=True)
class Question:
    prompt: str
    answer: str
    choices: tuple[str, ...]


QUESTIONS = [
    Question("你好", "مرحبا", ("مرحبا", "شكرا", "ماء", "سمك")),
    Question("谢谢", "شكرا", ("شكرا", "كبير", "بارد", "أرز")),
    Question("水", "ماء", ("ماء", "دجاج", "حار", "أنا")),
    Question("鱼", "سمك", ("سمك", "خبز", "صغير", "حلو")),
    Question("鸡肉", "دجاج", ("دجاج", "ماء", "لذيذ", "بارد")),
    Question("米饭", "أرز", ("أرز", "سمك", "حار", "كبير")),
    Question("好吃", "لذيذ", ("لذيذ", "أنا", "خبز", "شكرا")),
    Question("热", "ساخن", ("ساخن", "بارد", "ماء", "صغير")),
    Question("冷", "بارد", ("بارد", "حار", "مرحبا", "سمك")),
    Question("我", "أنا", ("أنا", "أرز", "دجاج", "لذيذ")),
]


class ProcessController:
    def __init__(self) -> None:
        self.process: subprocess.Popen[str] | None = None
        self.suspended = False

    @property
    def running(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def start_or_resume(self) -> None:
        if self.running:
            self.resume()
            return

        if not NFS_EXE.exists():
            raise FileNotFoundError(f"NFS executable not found: {NFS_EXE}")

        self.process = subprocess.Popen(
            [str(NFS_EXE), *NFS_ARGS],
            cwd=str(NFS_WORKDIR),
        )
        self.suspended = False

    def suspend(self) -> None:
        if not self.running or self.suspended:
            return
        _nt_call("NtSuspendProcess", self.process.pid)
        self.suspended = True

    def resume(self) -> None:
        if not self.running or not self.suspended:
            return
        _nt_call("NtResumeProcess", self.process.pid)
        self.suspended = False


def _nt_call(function_name: str, pid: int) -> None:
    if sys.platform != "win32":
        raise RuntimeError("Process suspension is implemented for Windows only.")

    access = 0x0800  # PROCESS_SUSPEND_RESUME
    handle = ctypes.windll.kernel32.OpenProcess(access, False, pid)
    if not handle:
        raise ctypes.WinError()

    try:
        fn = getattr(ctypes.windll.ntdll, function_name)
        status = fn(handle)
        if status != 0:
            raise OSError(f"{function_name} failed with NTSTATUS {status:#x}")
    finally:
        ctypes.windll.kernel32.CloseHandle(handle)


class RewardGate(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Arabic Reward Gate for NFS2")
        self.geometry("720x520")
        self.configure(bg="#f6f7fb")

        self.controller = ProcessController()
        self.round: list[Question] = []
        self.index = 0
        self.correct = 0
        self.remaining = 0
        self.timer_id: str | None = None
        self.selected = tk.StringVar(value="")

        self.status = tk.StringVar(value="完成一组阿语题后解锁 NFS2 驾驶时间。")
        self.score_text = tk.StringVar(value="")
        self.prompt_text = tk.StringVar(value="")

        self._build_ui()
        self.new_round()
        self.protocol("WM_DELETE_WINDOW", self.on_close)

    def _build_ui(self) -> None:
        container = tk.Frame(self, bg="#f6f7fb", padx=28, pady=24)
        container.pack(fill="both", expand=True)

        tk.Label(
            container,
            text="阿语题完成后解锁原版 NFS2",
            font=("Microsoft YaHei UI", 22, "bold"),
            bg="#f6f7fb",
            fg="#17202a",
        ).pack(anchor="w")

        tk.Label(
            container,
            textvariable=self.status,
            font=("Microsoft YaHei UI", 11),
            bg="#f6f7fb",
            fg="#526070",
        ).pack(anchor="w", pady=(6, 22))

        card = tk.Frame(container, bg="#ffffff", padx=22, pady=20)
        card.pack(fill="both", expand=True)

        tk.Label(
            card,
            textvariable=self.score_text,
            font=("Microsoft YaHei UI", 11, "bold"),
            bg="#ffffff",
            fg="#0f766e",
        ).pack(anchor="w")

        tk.Label(
            card,
            textvariable=self.prompt_text,
            font=("Microsoft YaHei UI", 24, "bold"),
            bg="#ffffff",
            fg="#17202a",
        ).pack(anchor="w", pady=(18, 12))

        self.choice_frame = tk.Frame(card, bg="#ffffff")
        self.choice_frame.pack(fill="x")

        self.submit_button = tk.Button(
            card,
            text="提交",
            command=self.submit_answer,
            font=("Microsoft YaHei UI", 13, "bold"),
            bg="#0f766e",
            fg="#ffffff",
            activebackground="#0b5f59",
            activeforeground="#ffffff",
            padx=18,
            pady=8,
        )
        self.submit_button.pack(anchor="w", pady=(18, 0))

    def new_round(self) -> None:
        self.round = sample(QUESTIONS, k=min(QUESTIONS_PER_ROUND, len(QUESTIONS)))
        self.index = 0
        self.correct = 0
        self.status.set("答完本轮题目后，根据正确率获得 30 到 90 秒驾驶时间。")
        self.render_question()

    def render_question(self) -> None:
        question = self.round[self.index]
        self.selected.set("")
        self.score_text.set(f"第 {self.index + 1}/{len(self.round)} 题")
        self.prompt_text.set(question.prompt)

        for child in self.choice_frame.winfo_children():
            child.destroy()

        choices = list(question.choices)
        shuffle(choices)
        for choice in choices:
            tk.Radiobutton(
                self.choice_frame,
                text=choice,
                value=choice,
                variable=self.selected,
                font=("Microsoft YaHei UI", 18),
                bg="#ffffff",
                fg="#17202a",
                selectcolor="#e7f6f3",
                anchor="w",
                padx=10,
                pady=6,
            ).pack(fill="x", anchor="w")

    def submit_answer(self) -> None:
        if not self.selected.get():
            messagebox.showinfo("请选择答案", "先选择一个阿语答案。")
            return

        if self.selected.get() == self.round[self.index].answer:
            self.correct += 1

        self.index += 1
        if self.index < len(self.round):
            self.render_question()
            return

        self.grant_time()

    def grant_time(self) -> None:
        accuracy = self.correct / len(self.round)
        if accuracy >= 0.9:
            seconds = 90
        elif accuracy >= 0.7:
            seconds = 60
        else:
            seconds = 30

        self.remaining = seconds
        self.status.set(f"正确 {self.correct}/{len(self.round)}，解锁 {seconds} 秒驾驶时间。")
        self.withdraw()
        try:
            self.controller.start_or_resume()
        except Exception as exc:
            self.deiconify()
            messagebox.showerror("无法启动 NFS2", str(exc))
            self.new_round()
            return
        self.tick()

    def tick(self) -> None:
        if self.remaining <= 0:
            self.freeze_game()
            return
        self.remaining -= 1
        self.timer_id = self.after(1000, self.tick)

    def freeze_game(self) -> None:
        self.timer_id = None
        try:
            self.controller.suspend()
        except Exception as exc:
            messagebox.showerror("暂停游戏失败", str(exc))
        self.deiconify()
        self.lift()
        self.focus_force()
        self.new_round()

    def on_close(self) -> None:
        if self.timer_id:
            self.after_cancel(self.timer_id)
        self.destroy()


if __name__ == "__main__":
    RewardGate().mainloop()
