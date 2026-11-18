"""手动运行：backend/.venv/bin/python tests/test_startup.py。仅使用新建临时目录。
运行前请关闭本项目，固定端口被占用会拒绝测试。日志留在输出的临时目录。
"""
from pathlib import Path
import json, os, signal, socket, subprocess, time, urllib.request, tempfile, io, hashlib, re
from PIL import Image
root=Path(__file__).resolve().parents[1]
base=Path(tempfile.mkdtemp(prefix='taw-lifecycle-')).resolve()
env={**os.environ,'TAW_DATA_DIR':str(base/'data'),'TAW_BACKUP_DIR':str(base/'backups')}
def post(path,data):
 req=urllib.request.Request('http://127.0.0.1:5188/api'+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json','X-Workbench-Request':'1'},method='POST')
 with urllib.request.urlopen(req,timeout=5) as response:return json.load(response)
def get(path):
 with urllib.request.urlopen('http://127.0.0.1:5188/api'+path,timeout=2) as r:return json.load(r)
for cycle in range(2):
 with (base/f'cycle-{cycle}.log').open('w') as log:
  proc=subprocess.Popen([str(root/'scripts/start.sh')],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
  try:
   deadline=time.monotonic()+20
   while True:
    if proc.poll() is not None:raise RuntimeError(f'start failed, cycle {cycle}')
    try:
     assert get('/health')['status']=='ok';break
    except OSError:
     if time.monotonic()>deadline:raise
     time.sleep(.2)
   assert get('/settings')['data_dir']==env['TAW_DATA_DIR'], 'Refusing to test an existing or different instance'
   if cycle==0:
    group=post('/classes',{'name':'重启测试模拟班级','school_year':'2026-2027'})
    student=post('/students',{'name':'重启模拟学生','student_no':'RESTART-001','class_id':group['id']})
    post('/classes/'+group['id']+'/layout',{'rows':3,'columns':4,'expected_version':1,'assignments':[{'row':2,'column':3,'student_id':student['id']}]})
    subject=post('/library/catalog/subjects',{'name':'重启验证化学','code':'RESTART-CHEM'})
    edition=post('/library/catalog/editions',{'name':'自建重启验证版','subject_id':subject['id']})
    book=post('/library/catalog/books',{'edition_id':edition['id'],'grade':'九年级','volume':'上册'})
    chapter=post('/library/catalog/nodes',{'book_id':book['id'],'name':'重启验证章'})
    point=post('/library/knowledge-points',{'subject_id':subject['id'],'name':'重启稳定知识点','code':'RESTART-KP','node_ids':[chapter['id']]})
    image=io.BytesIO();Image.new('RGB',(20,20),'blue').save(image,format='PNG')
    boundary='workbench-restart-boundary'
    body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="restart.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+image.getvalue()+f'\r\n--{boundary}--\r\n'.encode())
    request=urllib.request.Request('http://127.0.0.1:5188/api/library/assets',data=body,headers={'X-Workbench-Request':'1','Content-Type':'multipart/form-data; boundary='+boundary},method='POST')
    with urllib.request.urlopen(request) as response:asset=json.load(response)
    question=post('/library/questions',{'subject_id':subject['id'],'grade':'九年级','question_type':'简答题','difficulty':2,'stem':{'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'重启验证题干'},{'type':'asset','attrs':{'assetId':asset['id']}}]}]},'answer':{'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'验证答案'}]}]},'knowledge_links':[{'knowledge_point_id':point['id']}],'node_ids':[chapter['id']]})
    req=urllib.request.Request('http://127.0.0.1:5188/api/backups',data=b'{}',headers={'Content-Type':'application/json','X-Workbench-Request':'1'},method='POST')
    with urllib.request.urlopen(req) as response:backup=json.load(response)['name']
    post('/chemistry-graph/import',{'confirmation':'导入独立化学空间'})
    graph=get('/chemistry-graph/overview')
    assert (len(graph['points']),len(graph['edges']),graph['question_total'],graph['assets'])==(45,80,180,48)
    cg_point=graph['points'][0]['id']
    post('/chemistry-graph/view',{'positions':{cg_point:{'x':123,'y':45}},'selected':cg_point,'mode':'local'})
    cg_session=post('/chemistry-graph/practice',{'target':cg_point,'limit':6,'acknowledged':True})
    cg_session=post('/chemistry-graph/practice/'+cg_session['id']+'/answer',{'answer':'A','step':0})
    cg_backup=post('/chemistry-graph/backups',{})['name']
    cg_question=get('/chemistry-graph/questions?q=cnk_j004_q1')['items'][0]
    cg_detail=get('/chemistry-graph/questions/'+cg_question['id'])
    cg_asset=re.findall(r'"assetId":\s*"([a-f0-9]+)"',json.dumps(cg_detail['stem']))[0]
    with urllib.request.urlopen('http://127.0.0.1:5188/api/chemistry-graph/assets/'+cg_asset+'/file') as r:cg_hash=hashlib.sha256(r.read()).hexdigest()
    bad_env={**env,'TAW_DATA_DIR':str(base/'never-created-data'),'TAW_BACKUP_DIR':str(base/'never-created-backups')}
    occupied=subprocess.run([str(root/'scripts/start.sh')],env=bad_env,capture_output=True,text=True,timeout=5)
    assert occupied.returncode==1 and '已被占用' in occupied.stderr
    assert not (base/'never-created-data').exists()
   else:
    assert any(x['name']==backup for x in get('/backups')['items'])
    graph=get('/chemistry-graph/overview')
    assert (len(graph['points']),len(graph['edges']),graph['question_total'],graph['assets'])==(45,80,180,48)
    assert get('/chemistry-graph/view')['positions'][cg_point]=={'x':123,'y':45}
    assert len(get('/chemistry-graph/practice/'+cg_session['id'])['answers'])==1
    assert any(x['name']==cg_backup for x in get('/chemistry-graph/data')['backups'])
    with urllib.request.urlopen('http://127.0.0.1:5188/api/chemistry-graph/assets/'+cg_asset+'/file') as r:assert hashlib.sha256(r.read()).hexdigest()==cg_hash
    persisted=get('/students/'+student['id'])
    assert persisted['current_class']['id']==group['id'] and persisted['seat']['row']==2 and persisted['seat']['column']==3
    assert get('/classes/'+group['id']+'/layout')['rows']==3
    persisted_question=get('/library/questions/'+question['id'])
    assert persisted_question['version']==1 and persisted_question['node_ids']==[chapter['id']] and persisted_question['knowledge_links'][0]['knowledge_point_id']==point['id']
    with urllib.request.urlopen('http://127.0.0.1:5188/api/library/assets/'+asset['id']+'/file') as response:assert hashlib.sha256(response.read()).hexdigest()==asset['sha256']
   print(f'cycle {cycle+1}: health + persistence passed',flush=True)
  finally:
   if proc.poll() is None:
    proc.send_signal(signal.SIGINT)
   proc.wait(timeout=15)
   assert proc.returncode==0
  for port in (8087,5188):
   with socket.socket() as sock:assert sock.connect_ex(('127.0.0.1',port))!=0
  print(f'cycle {cycle+1}: Ctrl+C shutdown + port release passed',flush=True)
print('occupied port refusal before storage initialization passed')
print(f'Test-only data and logs: {base}')
