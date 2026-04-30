import re

with open('todoghost/src/app/features/main-view/main-view.component.ts', 'r') as f:
    content = f.read()

content = content.replace("  showForm = false;", "  showForm = false;\n  showTimeReminder = false;")

content = content.replace("""  openCreateTask() {
    this.editingTask = null;
    this.formTask = {
       date: this.selectedDateStr
    };
    this.formTaskTags = [];
    this.formTaskTagInput = '';
    this.showForm = true;
  }""", """  openCreateTask() {
    this.editingTask = null;
    this.formTask = {
       date: this.selectedDateStr
    };
    this.formTaskTags = [];
    this.formTaskTagInput = '';
    this.showTimeReminder = false;
    this.showForm = true;
  }""")

content = content.replace("""  editTask(task: Task) {
    if (this.longPressTriggered) return;
    const s = this.swipeState[task.id];
    if (s && s.offset !== 0) {
      s.offset = 0;
      return;
    }
    this.editingTask = task;
    this.formTask = { ...task };
    this.formTaskTags = task.tags ? [...task.tags] : [];
    this.formTaskTagInput = '';
    this.showForm = true;
  }""", """  editTask(task: Task) {
    if (this.longPressTriggered) return;
    const s = this.swipeState[task.id];
    if (s && s.offset !== 0) {
      s.offset = 0;
      return;
    }
    this.editingTask = task;
    this.formTask = { ...task };
    this.formTaskTags = task.tags ? [...task.tags] : [];
    this.formTaskTagInput = '';
    this.showTimeReminder = !!(task.startTime || task.endTime || task.enablePush);
    this.showForm = true;
  }""")

content = content.replace("""  copyTask(task: Task) {
     this.formTask = { ...task, title: task.title + ' (複製)', id: undefined };
     this.editingTask = null;
     if (this.swipeState[task.id]) {
       this.swipeState[task.id].offset = 0; // reset swipe
     }
     this.showForm = true;
  }""", """  copyTask(task: Task) {
     this.formTask = { ...task, title: task.title + ' (複製)', id: undefined };
     this.editingTask = null;
     if (this.swipeState[task.id]) {
       this.swipeState[task.id].offset = 0; // reset swipe
     }
     this.showTimeReminder = !!(task.startTime || task.endTime || task.enablePush);
     this.showForm = true;
  }""")


with open('todoghost/src/app/features/main-view/main-view.component.ts', 'w') as f:
    f.write(content)
