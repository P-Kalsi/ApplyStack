-- Seed internships so the board is fully usable before any live source is
-- configured. Companies are fictional; postings are realistic samples.
-- Safe to run multiple times (upserts on dedupe_key).

insert into public.jobs
  (source, source_id, company, company_slug, title, location, work_mode, employment_type,
   categories, url, description_text, skills, ats_keywords, posted_at, dedupe_key)
values
(
  'seed', 'seed-1', 'Cascadia Cloud', 'cascadia-cloud',
  'Software Engineer Intern, Backend (Summer 2027)', 'Vancouver, BC', 'hybrid', 'internship',
  array['software-engineering','backend'],
  'https://example.com/cascadia/backend-intern',
  E'Cascadia Cloud builds managed infrastructure for Canadian startups.\n\nAs a backend intern you will design and ship production services used by thousands of developers.\n\nWhat you will do:\n- Build REST and gRPC services in Go and TypeScript (Node.js)\n- Design PostgreSQL schemas and tune slow queries\n- Add observability with structured logging, metrics, and tracing\n- Ship containerized services to Kubernetes behind CI/CD\n\nWhat we look for:\n- Pursuing a BSc in Computer Science or similar, graduating 2027 or later\n- Solid grasp of data structures, HTTP, and SQL\n- Experience with Docker and at least one typed language (TypeScript, Go, Java)\n- Bonus: Terraform, AWS, or a self-hosted home lab\n\nStack: Go, TypeScript, Node.js, PostgreSQL, Docker, Kubernetes, AWS, Terraform.',
  array['go','typescript','node.js','postgresql','docker','kubernetes','aws','terraform','sql','grpc','rest'],
  array['backend','microservices','ci/cd','observability','REST APIs','containers'],
  now() - interval '2 days', 'cascadia-cloud|software-engineer-intern-backend-summer-2027|vancouver-bc|https://example.com/cascadia/backend-intern'
),
(
  'seed', 'seed-2', 'Lumen Analytics', 'lumen-analytics',
  'Data Engineering Intern', 'Toronto, ON', 'remote', 'internship',
  array['data','backend'],
  'https://example.com/lumen/data-intern',
  E'Lumen Analytics turns messy operational data into decision-ready datasets.\n\nResponsibilities:\n- Build and maintain ELT pipelines in Python and SQL\n- Model warehouse tables in PostgreSQL and BigQuery\n- Write data quality checks and pipeline tests\n- Automate workflows with Airflow and Docker\n\nQualifications:\n- CS, engineering, or statistics student\n- Strong Python and SQL fundamentals\n- Familiarity with Pandas and data modelling\n- Bonus: dbt, Airflow, or cloud warehouses\n\nStack: Python, SQL, PostgreSQL, Pandas, Airflow, dbt, Docker, GCP.',
  array['python','sql','postgresql','pandas','airflow','dbt','docker','gcp','bigquery'],
  array['data pipelines','ELT','data quality','warehouse','orchestration'],
  now() - interval '3 days', 'lumen-analytics|data-engineering-intern|toronto-on|https://example.com/lumen/data-intern'
),
(
  'seed', 'seed-3', 'Northbeam Robotics', 'northbeam-robotics',
  'Frontend Engineer Intern (React)', 'Seattle, WA', 'onsite', 'internship',
  array['frontend','software-engineering'],
  'https://example.com/northbeam/frontend-intern',
  E'Northbeam Robotics builds fleet-management software for warehouse robots.\n\nYou will:\n- Build operator dashboards in React and TypeScript\n- Create reusable UI components with strong accessibility\n- Visualize live telemetry with WebSockets and charting\n- Collaborate with designers and robotics engineers\n\nRequirements:\n- Student in CS or related field\n- Production-quality React, TypeScript, HTML, CSS\n- Understanding of REST APIs and state management\n- Bonus: Vite, testing-library, WebGL, or data visualization\n\nStack: React, TypeScript, Vite, Tailwind CSS, WebSockets, REST APIs.',
  array['react','typescript','vite','tailwind','css','html','websockets','rest','javascript'],
  array['component library','accessibility','dashboards','state management','data visualization'],
  now() - interval '1 day', 'northbeam-robotics|frontend-engineer-intern-react|seattle-wa|https://example.com/northbeam/frontend-intern'
),
(
  'seed', 'seed-4', 'Pacific Ledger', 'pacific-ledger',
  'Full Stack Developer Intern', 'Vancouver, BC', 'hybrid', 'internship',
  array['full-stack','software-engineering'],
  'https://example.com/pacificledger/fullstack-intern',
  E'Pacific Ledger is a fintech startup building bookkeeping automation for small businesses.\n\nWhat you will do:\n- Ship features end to end across a React/Next.js frontend and Node.js backend\n- Design PostgreSQL schemas and write typed APIs\n- Improve test coverage and CI reliability\n- Work directly with founders at an early-stage startup\n\nWhat we need:\n- CS student with strong JavaScript/TypeScript\n- Experience with React and a relational database\n- Comfort owning features end to end with minimal direction\n- Bonus: Next.js, Docker, AWS, startup experience\n\nStack: React, Next.js, TypeScript, Node.js, PostgreSQL, Docker, AWS.',
  array['react','next.js','typescript','node.js','postgresql','docker','aws','javascript'],
  array['full stack','end-to-end ownership','startup','REST APIs','testing'],
  now() - interval '5 days', 'pacific-ledger|full-stack-developer-intern|vancouver-bc|https://example.com/pacificledger/fullstack-intern'
),
(
  'seed', 'seed-5', 'Helios ML', 'helios-ml',
  'Machine Learning Intern, Applied AI', 'San Francisco, CA', 'hybrid', 'internship',
  array['ai-ml','data'],
  'https://example.com/helios/ml-intern',
  E'Helios ML ships applied AI products for education companies.\n\nRole:\n- Prototype and evaluate LLM-powered features\n- Build data preparation pipelines in Python (Pandas, Scikit-learn)\n- Run offline evaluations and error analysis\n- Ship model-backed APIs with FastAPI and Docker\n\nRequirements:\n- CS/ML student with strong Python\n- Hands-on experience with Scikit-learn or an ML framework\n- Experience integrating LLM APIs (OpenAI, Gemini, Claude) into applications\n- Bonus: FastAPI, vector databases, prompt evaluation\n\nStack: Python, Scikit-learn, Pandas, FastAPI, Docker, LLM APIs.',
  array['python','scikit-learn','pandas','fastapi','docker','llm','machine learning','gemini api'],
  array['LLM integration','model evaluation','feature prototyping','applied AI','data pipelines'],
  now() - interval '4 days', 'helios-ml|machine-learning-intern-applied-ai|san-francisco-ca|https://example.com/helios/ml-intern'
),
(
  'seed', 'seed-6', 'Granite Peak Systems', 'granite-peak-systems',
  'Site Reliability Engineering Intern', 'Remote (Canada)', 'remote', 'internship',
  array['sre','devops','cloud'],
  'https://example.com/granitepeak/sre-intern',
  E'Granite Peak Systems runs high-availability platforms for healthcare clients.\n\nYou will:\n- Automate infrastructure with Terraform and Ansible\n- Improve monitoring, alerting, and on-call runbooks (Prometheus, Grafana)\n- Harden Kubernetes clusters and container images\n- Investigate incidents and write postmortems\n\nRequirements:\n- Student in CS or related program\n- Linux fundamentals and shell scripting\n- Experience with Docker or containerized services (home labs count!)\n- Bonus: Kubernetes, Terraform, Prometheus, networking/DNS experience\n\nStack: Linux, Docker, Kubernetes, Terraform, Prometheus, Grafana, AWS.',
  array['linux','docker','kubernetes','terraform','prometheus','grafana','aws','ansible','bash','dns'],
  array['reliability','monitoring','incident response','automation','infrastructure as code'],
  now() - interval '6 days', 'granite-peak-systems|site-reliability-engineering-intern|remote-canada|https://example.com/granitepeak/sre-intern'
),
(
  'seed', 'seed-7', 'Bluewater Games', 'bluewater-games',
  'Software Developer Intern, Tools', 'Burnaby, BC', 'onsite', 'internship',
  array['software-engineering','backend'],
  'https://example.com/bluewater/tools-intern',
  E'Bluewater Games builds cross-platform multiplayer titles.\n\nThe tools team keeps 200+ developers productive.\n\nResponsibilities:\n- Build internal web tools with React and TypeScript\n- Extend build/CI pipelines and developer CLIs (Python, Node.js)\n- Profile and fix slow workflows\n\nRequirements:\n- CS student with strong programming fundamentals\n- Experience with TypeScript or Python\n- Interest in developer experience and automation\n- Bonus: C++, game engines, REST API design\n\nStack: TypeScript, React, Python, Node.js, REST APIs, CI/CD.',
  array['typescript','react','python','node.js','rest','c++','ci/cd'],
  array['developer tools','automation','internal tools','build pipelines'],
  now() - interval '9 days', 'bluewater-games|software-developer-intern-tools|burnaby-bc|https://example.com/bluewater/tools-intern'
),
(
  'seed', 'seed-8', 'Meridian Health Tech', 'meridian-health-tech',
  'Backend Engineer Intern (Python/FastAPI)', 'Remote (North America)', 'remote', 'internship',
  array['backend','software-engineering'],
  'https://example.com/meridian/backend-intern',
  E'Meridian builds patient-scheduling infrastructure for clinics.\n\nWhat you will do:\n- Design and implement FastAPI services backed by PostgreSQL\n- Write typed, well-tested Python\n- Build integrations with third-party healthcare APIs\n- Containerize services with Docker and deploy via CI\n\nRequirements:\n- CS student; strong Python and SQL\n- Understanding of REST API design and authentication\n- Experience with Docker\n- Bonus: TypeScript, React, HIPAA-adjacent domains\n\nStack: Python, FastAPI, PostgreSQL, Docker, REST APIs, pytest.',
  array['python','fastapi','postgresql','docker','rest','pytest','sql','typescript'],
  array['API design','authentication','integrations','testing','containers'],
  now() - interval '7 days', 'meridian-health-tech|backend-engineer-intern-python-fastapi|remote-north-america|https://example.com/meridian/backend-intern'
),
(
  'seed', 'seed-9', 'Aurora Grid', 'aurora-grid',
  'Cloud Infrastructure Intern', 'Calgary, AB', 'hybrid', 'internship',
  array['cloud','devops'],
  'https://example.com/auroragrid/cloud-intern',
  E'Aurora Grid builds forecasting software for renewable energy operators.\n\nRole:\n- Provision AWS infrastructure with Terraform\n- Build deployment pipelines (GitHub Actions)\n- Manage containerized workloads on ECS/Kubernetes\n- Improve cost visibility and tagging\n\nRequirements:\n- Student in CS/software engineering\n- Familiarity with a major cloud provider (AWS preferred)\n- Docker experience; scripting in Python or Bash\n- Bonus: Terraform, Kubernetes, networking, DNS and domain management\n\nStack: AWS, Terraform, Docker, Kubernetes, GitHub Actions, Python, Bash.',
  array['aws','terraform','docker','kubernetes','github actions','python','bash','dns'],
  array['infrastructure as code','deployment pipelines','cloud cost','networking'],
  now() - interval '11 days', 'aurora-grid|cloud-infrastructure-intern|calgary-ab|https://example.com/auroragrid/cloud-intern'
),
(
  'seed', 'seed-10', 'Kite & Compass', 'kite-and-compass',
  'Software Engineering Intern (Winter 2027)', 'Toronto, ON', 'hybrid', 'internship',
  array['software-engineering','full-stack'],
  'https://example.com/kitecompass/swe-intern',
  E'Kite & Compass is a travel-tech scale-up.\n\nYou will rotate across product squads:\n- Implement features in React/TypeScript and Node.js services\n- Write integration tests and participate in code review\n- Ship behind feature flags with weekly releases\n\nRequirements:\n- CS student graduating 2027+\n- Strong fundamentals in data structures and algorithms\n- Experience with JavaScript/TypeScript and REST APIs\n- Bonus: Next.js, PostgreSQL, Redis, GraphQL\n\nStack: React, TypeScript, Node.js, Next.js, PostgreSQL, Redis, GraphQL.',
  array['react','typescript','node.js','next.js','postgresql','redis','graphql','javascript','rest'],
  array['feature delivery','code review','integration testing','agile'],
  now() - interval '12 days', 'kite-and-compass|software-engineering-intern-winter-2027|toronto-on|https://example.com/kitecompass/swe-intern'
),
(
  'seed', 'seed-11', 'Fernwood AI', 'fernwood-ai',
  'AI Engineering Intern (LLM Applications)', 'Vancouver, BC', 'onsite', 'internship',
  array['ai-ml','software-engineering'],
  'https://example.com/fernwood/ai-intern',
  E'Fernwood AI builds retrieval-augmented assistants for legal teams.\n\nWhat you will do:\n- Build LLM pipelines: chunking, embeddings, retrieval, evaluation\n- Ship product features in React/TypeScript + Python services\n- Design prompt and eval suites; measure quality regressions\n- Work with PostgreSQL and vector search\n\nRequirements:\n- CS student with strong Python and TypeScript\n- Experience calling LLM APIs in real applications\n- Understanding of REST APIs, Docker, and SQL\n- Bonus: FastAPI, RAG systems, embeddings, eval tooling\n\nStack: Python, TypeScript, React, FastAPI, PostgreSQL, Docker, LLM APIs.',
  array['python','typescript','react','fastapi','postgresql','docker','llm','rag','embeddings'],
  array['retrieval augmented generation','prompt engineering','evaluation','vector search'],
  now() - interval '2 days', 'fernwood-ai|ai-engineering-intern-llm-applications|vancouver-bc|https://example.com/fernwood/ai-intern'
),
(
  'seed', 'seed-12', 'Harborline', 'harborline',
  'DevOps Intern, Platform Engineering', 'Montreal, QC', 'remote', 'internship',
  array['devops','cloud','sre'],
  'https://example.com/harborline/devops-intern',
  E'Harborline runs logistics APIs for ports and rail.\n\nRole:\n- Maintain Kubernetes-based developer platform\n- Build golden-path templates and internal docs\n- Automate TLS, DNS, and secrets management\n- Extend GitHub Actions pipelines and self-hosted runners\n\nRequirements:\n- Student with Linux + containers experience\n- Scripting in Bash or Python\n- Understanding of networking, DNS, HTTP\n- Bonus: home lab, Kubernetes, Terraform, monitoring stacks\n\nStack: Kubernetes, Docker, Terraform, GitHub Actions, Linux, Python, Bash.',
  array['kubernetes','docker','terraform','github actions','linux','python','bash','dns','networking'],
  array['platform engineering','developer experience','secrets management','automation'],
  now() - interval '15 days', 'harborline|devops-intern-platform-engineering|montreal-qc|https://example.com/harborline/devops-intern'
),
(
  'seed', 'seed-13', 'Quill & Query', 'quill-and-query',
  'Data Science Intern (Product Analytics)', 'Remote (Canada)', 'remote', 'internship',
  array['data','ai-ml'],
  'https://example.com/quillquery/ds-intern',
  E'Quill & Query builds analytics for ed-tech products.\n\nWhat you will do:\n- Analyze learning-outcome datasets in Python (Pandas, NumPy)\n- Build predictive models with Scikit-learn\n- Design experiments and communicate findings\n- Productionize notebooks into scheduled jobs\n\nRequirements:\n- Student in CS, statistics, or math\n- Strong Python, Pandas, and SQL\n- Applied ML experience (classification/regression projects welcome)\n- Bonus: education datasets, recommender systems, Docker\n\nStack: Python, Pandas, NumPy, Scikit-learn, SQL, Docker.',
  array['python','pandas','numpy','scikit-learn','sql','docker','machine learning'],
  array['predictive modelling','experimentation','product analytics','feature engineering'],
  now() - interval '8 days', 'quill-and-query|data-science-intern-product-analytics|remote-canada|https://example.com/quillquery/ds-intern'
),
(
  'seed', 'seed-14', 'Stonebridge Financial', 'stonebridge-financial',
  'Software Engineer Intern, Web Platform', 'Toronto, ON', 'onsite', 'internship',
  array['frontend','full-stack','software-engineering'],
  'https://example.com/stonebridge/web-intern',
  E'Stonebridge Financial modernizes retail-banking experiences.\n\nResponsibilities:\n- Build accessible React + TypeScript features on our design system\n- Integrate REST and GraphQL services\n- Improve Core Web Vitals and bundle size\n- Write unit and end-to-end tests (Playwright)\n\nRequirements:\n- CS student, graduating 2027 or later\n- Strong JavaScript/TypeScript, HTML, CSS\n- Experience consuming REST APIs\n- Bonus: Next.js, accessibility (WCAG), performance profiling\n\nStack: React, TypeScript, Next.js, GraphQL, REST, Playwright.',
  array['react','typescript','next.js','graphql','rest','playwright','javascript','css','html'],
  array['accessibility','design system','web performance','end-to-end testing'],
  now() - interval '10 days', 'stonebridge-financial|software-engineer-intern-web-platform|toronto-on|https://example.com/stonebridge/web-intern'
)
on conflict (dedupe_key) do update set
  description_text = excluded.description_text,
  skills = excluded.skills,
  ats_keywords = excluded.ats_keywords,
  posted_at = excluded.posted_at;
