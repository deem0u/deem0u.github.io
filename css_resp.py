# -*- coding: utf-8 -*-
import os
_path_here = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(_path_here, "styles.css")
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

old = """  .user-list-stats {
    justify-content: space-between;
  }
  
  .search-filter-row {"""

new = """  .user-list-stats-block {
    flex-direction: column;
    align-items: flex-end;
  }
  
  .user-list-stats {
    justify-content: flex-end;
  }
  
  .search-filter-row {"""

if old in c:
    c = c.replace(old, new)
    print("Updated")
else:
    print("Not found")
with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
