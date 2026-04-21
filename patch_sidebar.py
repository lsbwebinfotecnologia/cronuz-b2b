path = "frontend/src/components/Sidebar.tsx"
with open(path, "r") as f:
    content = f.read()

old_sub = """       subItems: [
         { name: 'Lançamentos', href: '/financial', icon: Wallet },
         { name: 'Conciliação', href: '/financial/reconciliation', icon: Landmark },
         { name: 'DRE', href: '/financial/reports', icon: BarChart3 }
       ]"""

new_sub = """       subItems: [
         { name: 'Lançamentos', href: '/financial', icon: Wallet },
         { name: 'Boletos Emitidos', href: '/financial/bank-slips', icon: Receipt },
         { name: 'Conciliação', href: '/financial/reconciliation', icon: Landmark },
         { name: 'DRE', href: '/financial/reports', icon: BarChart3 }
       ]"""

if old_sub in content:
    content = content.replace(old_sub, new_sub)
    with open(path, "w") as f:
        f.write(content)
    print("Patched sidebar successfully!")
else:
    print("Sidebar Block not found!")

