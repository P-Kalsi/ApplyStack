// Test fixture: a small, stable sample profile + LaTeX resume. Kept separate
// from the real starter profile so tests never depend on personal data.

import type { FactCategory, SkillCategory } from "../../src/lib/types";

export interface StarterProject {
  name: string;
  technologies: string[];
  description: string;
  facts: { text: string; category: FactCategory }[];
}

export interface StarterExperience {
  company: string;
  role: string;
  location: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  summary: string;
  facts: { text: string; category: FactCategory }[];
}

export const STARTER_EDUCATION = {
  school: "University of British Columbia",
  degree: "BSc",
  major: "Computer Science",
  location: "Vancouver, BC",
  start_date: "Sep 2023",
  expected_graduation: "May 2027",
  coursework: [
    "Software Construction",
    "Data Structures and Algorithms",
    "Computer Systems",
    "Databases",
    "Software Engineering",
  ],
};

export const STARTER_EXPERIENCES: StarterExperience[] = [
  {
    company: "Early-stage startup",
    role: "Software Developer (Part-time)",
    location: "Vancouver, BC",
    start_date: "May 2025",
    end_date: "Aug 2025",
    is_current: false,
    summary: "Helped build software and web presence from an early stage.",
    facts: [
      { text: "Built a responsive multi-page company website.", category: "general" },
      { text: "Configured DNS and custom domain infrastructure.", category: "general" },
      { text: "Integrated a custom web form.", category: "general" },
      {
        text: "Worked at a startup and helped build software from an early stage.",
        category: "general",
      },
    ],
  },
];

export const STARTER_PROJECTS: StarterProject[] = [
  {
    name: "SaveMyGrade",
    technologies: ["React", "Flask", "Python", "Scikit-learn", "Pandas", "Gemini API", "Docker"],
    description:
      "Course-planning tool that predicts grades and summarizes professor reviews.",
    facts: [
      {
        text: "Built SaveMyGrade using React, Flask, Python, Scikit-learn, Pandas, Gemini API, and Docker.",
        category: "general",
      },
      {
        text: "SaveMyGrade uses approximately 3,300 professor review files and approximately 5,000 course catalogue records.",
        category: "metric",
      },
    ],
  },
  {
    name: "ProtectPibble",
    technologies: ["React", "TypeScript", "FastAPI", "PostgreSQL", "Docker", "Tailwind"],
    description: "Full-stack web application with a typed API and relational persistence.",
    facts: [
      {
        text: "Built ProtectPibble using React, TypeScript, FastAPI, PostgreSQL, Docker, and Tailwind.",
        category: "general",
      },
    ],
  },
  {
    name: "SiteSee",
    technologies: ["React", "JavaScript", "Vite", "WebGazer.js"],
    description: "Web app exploring gaze-based interaction in the browser.",
    facts: [
      {
        text: "Built SiteSee using React, JavaScript, Vite, and WebGazer.js.",
        category: "general",
      },
    ],
  },
  {
    name: "InsightUBC",
    technologies: ["Node.js", "TypeScript", "React", "CSS", "REST APIs"],
    description: "Course/rooms query engine and UI built for UBC software engineering.",
    facts: [
      {
        text: "Built InsightUBC using Node.js, TypeScript, React, CSS, and REST APIs.",
        category: "general",
      },
    ],
  },
  {
    name: "Home lab",
    technologies: ["Docker", "Linux", "Networking"],
    description: "Self-hosted services running as containers on a home server.",
    facts: [
      {
        text: "Built and maintained a self-hosted home lab with containerized services.",
        category: "general",
      },
    ],
  },
];

export const STARTER_SKILLS: { category: SkillCategory; items: string[] }[] = [
  { category: "languages", items: ["TypeScript", "JavaScript", "Python", "Java", "SQL", "HTML", "CSS"] },
  { category: "frameworks", items: ["React", "Flask", "FastAPI", "Node.js", "Express"] },
  { category: "libraries", items: ["Pandas", "Scikit-learn", "Tailwind", "Vite", "WebGazer.js"] },
  { category: "databases", items: ["PostgreSQL", "SQLite"] },
  { category: "infrastructure", items: ["Docker", "Linux", "DNS", "Networking"] },
  { category: "developer_tools", items: ["Git", "GitHub Actions", "VS Code"] },
];

export const STARTER_GENERAL_FACTS: { text: string; category: FactCategory }[] = [
  {
    text: "University of British Columbia BSc Computer Science student with expected graduation May 2027.",
    category: "education",
  },
];

/**
 * A sample master resume in LaTeX matching the starter vault, using a common
 * single-page resume structure. Users are expected to replace this with
 * their own LaTeX resume; the tailoring engine preserves whatever structure
 * the pasted resume has.
 */
export const SAMPLE_MASTER_RESUME = String.raw`\documentclass[letterpaper,11pt]{article}

\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage[english]{babel}
\pagestyle{empty}

\titleformat{\section}{\scshape\large}{}{0em}{}[\titlerule]

\newcommand{\resumeItem}[1]{\item\small{#1}}
\newcommand{\resumeItemListStart}{\begin{itemize}[leftmargin=0.2in]}
\newcommand{\resumeItemListEnd}{\end{itemize}}
\newcommand{\resumeSubheading}[4]{
  \item
  \begin{tabular*}{\textwidth}[t]{l@{\extracolsep{\fill}}r}
    \textbf{#1} & #2 \\
    \textit{\small#3} & \textit{\small #4} \\
  \end{tabular*}}
\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.0in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}

\begin{document}

\begin{center}
  {\Huge PKalsi} \\
  Vancouver, BC ~|~ \href{mailto:student@example.com}{student@example.com} ~|~ \href{https://github.com/example}{github.com/example}
\end{center}

\section{Education}
\resumeSubHeadingListStart
  \resumeSubheading{University of British Columbia}{Vancouver, BC}{BSc Computer Science, expected graduation May 2027}{Sep 2023 -- Present}
\resumeSubHeadingListEnd

\section{Experience}
\resumeSubHeadingListStart
  \resumeSubheading{Early-stage startup}{Vancouver, BC}{Software Developer (Part-time)}{May 2025 -- Aug 2025}
  \resumeItemListStart
    \resumeItem{Built a responsive multi-page company website.}
    \resumeItem{Configured DNS and custom domain infrastructure.}
    \resumeItem{Integrated a custom web form.}
  \resumeItemListEnd
\resumeSubHeadingListEnd

\section{Projects}
\resumeSubHeadingListStart
  \resumeSubheading{SaveMyGrade}{React, Flask, Python, Scikit-learn, Pandas, Gemini API, Docker}{Course planning tool}{2025}
  \resumeItemListStart
    \resumeItem{Built SaveMyGrade using React, Flask, Python, Scikit-learn, Pandas, Gemini API, and Docker.}
    \resumeItem{Processed approximately 3,300 professor review files and approximately 5,000 course catalogue records.}
  \resumeItemListEnd
  \resumeSubheading{ProtectPibble}{React, TypeScript, FastAPI, PostgreSQL, Docker, Tailwind}{Full-stack web application}{2025}
  \resumeItemListStart
    \resumeItem{Built ProtectPibble using React, TypeScript, FastAPI, PostgreSQL, Docker, and Tailwind.}
  \resumeItemListEnd
  \resumeSubheading{InsightUBC}{Node.js, TypeScript, React, CSS, REST APIs}{Course/rooms query engine}{2024}
  \resumeItemListStart
    \resumeItem{Built InsightUBC using Node.js, TypeScript, React, CSS, and REST APIs.}
  \resumeItemListEnd
  \resumeSubheading{SiteSee}{React, JavaScript, Vite, WebGazer.js}{Gaze-based browsing experiment}{2024}
  \resumeItemListStart
    \resumeItem{Built SiteSee using React, JavaScript, Vite, and WebGazer.js.}
  \resumeItemListEnd
\resumeSubHeadingListEnd

\section{Technical Skills}
\resumeSubHeadingListStart
  \resumeItem{\textbf{Languages}: TypeScript, JavaScript, Python, Java, SQL, HTML, CSS}
  \resumeItem{\textbf{Frameworks}: React, Flask, FastAPI, Node.js, Express}
  \resumeItem{\textbf{Tools \& Infrastructure}: Docker, Linux, Git, GitHub Actions, DNS, PostgreSQL}
\resumeSubHeadingListEnd

\section{Additional}
\resumeSubHeadingListStart
  \resumeItem{Built and maintained a self-hosted home lab with containerized services.}
\resumeSubHeadingListEnd

\end{document}
`;
