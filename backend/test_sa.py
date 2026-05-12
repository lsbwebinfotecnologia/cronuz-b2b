from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import declarative_base, relationship, Session
from sqlalchemy import create_engine

Base = declarative_base()

class Group(Base):
    __tablename__ = 'groups'
    id = Column(Integer, primary_key=True)

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey('groups.id'))
    group = relationship('Group')

engine = create_engine('sqlite:///:memory:')
Base.metadata.create_all(engine)

session = Session(engine)
g = Group(id=1)
u = User(id=1, group=g)
session.add_all([g, u])
session.commit()

u = session.query(User).first()
print("Before:", u.group)
try:
    u.group = {"id": 1}
    print("After:", u.group)
except Exception as e:
    print("Error:", e)
