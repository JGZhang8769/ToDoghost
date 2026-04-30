import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

# I already implemented strikethrough logic in Step 2 when writing the unified HTML.
# Let's double check if it's there.
# Look for unassigned drawer tasks
