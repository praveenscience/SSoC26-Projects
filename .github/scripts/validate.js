#!/usr/bin/env node

/**
 * Projects JSON Validator Script
 * Used in CI pipeline (GitHub Actions) to validate projects.json.
 * Matches the validation rules of the front-end validator portal.
 */

const fs = require('fs');
const path = require('path');

const defaultPath = path.join(__dirname, '../../projects.json');
const FILE_PATH = process.argv[2] ? path.resolve(process.argv[2]) : defaultPath;

// Colors for terminal output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

console.log(`${CYAN}Starting projects.json validation...${RESET}\n`);

// 1. Check if the projects.json file exists
if (!fs.existsSync(FILE_PATH)) {
  console.error(`${RED}Error: projects.json file not found at ${FILE_PATH}${RESET}`);
  process.exit(1);
}

const rawContent = fs.readFileSync(FILE_PATH, 'utf8');

// 2. Validate JSON syntax
let data;
try {
  data = JSON.parse(rawContent);
} catch (e) {
  console.error(`${RED}Error: projects.json is not a valid JSON file. Please check syntax.${RESET}`);
  console.error(`${RED}${e.message}${RESET}`);
  process.exit(1);
}

// 3. Ensure the root of the JSON file is an array
if (!Array.isArray(data)) {
  console.error(`${RED}Error: projects.json must be a JSON array of project objects.${RESET}`);
  process.exit(1);
}

/* ==========================================
   Validation Helper Functions & Rules
   ========================================== */

/**
 * GitHub Username Rules:
 * - Must be a string.
 * - Can only contain alphanumeric characters and single hyphens.
 * - Cannot start or end with a hyphen.
 * - Cannot contain consecutive/double hyphens (--).
 * - Maximum length is 39 characters (GitHub's maximum username length).
 */
function isValidGitHubUser(s) {
  if (typeof s !== 'string') return false;
  const usernameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?$/;
  return usernameRegex.test(s) && !s.includes('--') && s.length <= 39;
}

/**
 * GitHub Repository Rules:
 * - Must be a string.
 * - Can contain alphanumeric characters, periods (.), hyphens (-), and underscores (_).
 * - Cannot be '.' or '..'.
 */
function isValidGitHubRepo(s) {
  if (typeof s !== 'string') return false;
  const repoRegex = /^[a-zA-Z0-9][a-zA-Z0-9\.\-\_]*$/;
  return repoRegex.test(s) && s !== '.' && s !== '..';
}

/**
 * LinkedIn URL Rules:
 * - Must start with https://
 * - Optional 'www.'
 * - Domain must be linkedin.com
 * - Profile path must begin with '/in/' followed by valid username characters (alphanumeric, hyphen, period, underscore).
 * - Optional trailing slash.
 */
function isValidLinkedIn(u) {
  if (typeof u !== 'string') return false;
  const linkedinRegex = /^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-\.\_]+\/?$/;
  return linkedinRegex.test(u);
}

/**
 * Alphabetical Order Rule:
 * - Check if the project array is sorted alphabetically by `projectName`.
 * - Case-insensitive comparison (localeCompare with sensitivity: 'base').
 */
function checkSortOrder(arr) {
  const issues = [];
  for (let i = 1; i < arr.length; i++) {
    const currentName = arr[i].projectName || '';
    const previousName = arr[i - 1].projectName || '';
    if (currentName.localeCompare(previousName, undefined, { sensitivity: 'base' }) < 0) {
      issues.push(`Project "${currentName}" (index ${i}) is placed before project "${previousName}" (index ${i - 1}). List must be in alphabetical order by project name.`);
    }
  }
  return issues;
}

/* ==========================================
   Core Project Verification
   ========================================== */

let totalErrors = 0;
const results = [];

data.forEach((project, idx) => {
  const errors = [];
  const projectIndex = idx + 1;
  const nameLabel = project.projectName || `(unnamed project at index ${projectIndex})`;

  // Owner Validation
  if (!project.owner) {
    errors.push('Field "owner" is missing.');
  } else if (!isValidGitHubUser(project.owner)) {
    errors.push(`Owner "${project.owner}" is not a valid GitHub username.`);
  }

  // Repo Validation
  if (!project.repo) {
    errors.push('Field "repo" is missing.');
  } else if (!isValidGitHubRepo(project.repo)) {
    errors.push(`Repo "${project.repo}" is not a valid GitHub repository name.`);
  }

  // Project Name Validation (Maximum 35 characters)
  if (!project.projectName) {
    errors.push('Field "projectName" is missing.');
  } else if (project.projectName.length > 35) {
    errors.push(`projectName too long (${project.projectName.length} characters, max is 35).`);
  }

  // Description Validation (Must be between 120 and 150 characters inclusive)
  if (!project.description) {
    errors.push('Field "description" is missing.');
  } else {
    const len = project.description.length;
    if (len < 120) {
      errors.push(`Description too short (${len} characters, must be between 120 and 150).`);
    } else if (len > 150) {
      errors.push(`Description too long (${len} characters, must be between 120 and 150).`);
    }
  }

  // Tech Stack Validation (Must be a non-empty array)
  if (!project.techStack) {
    errors.push('Field "techStack" is missing.');
  } else if (!Array.isArray(project.techStack)) {
    errors.push('Field "techStack" must be an array.');
  } else if (project.techStack.length === 0) {
    errors.push('Field "techStack" is empty; at least one technology must be listed.');
  }

  // Admin LinkedIn Validation
  if (!project.linkedIn) {
    errors.push('Field "linkedIn" (Project Admin URL) is missing.');
  } else if (!isValidLinkedIn(project.linkedIn)) {
    errors.push(`Admin LinkedIn URL "${project.linkedIn}" is invalid.`);
  }

  // Mentors Validation (Optional array, but URLs must be valid if provided)
  if (project.mentors) {
    if (!Array.isArray(project.mentors)) {
      errors.push('Field "mentors" must be an array of mentor objects.');
    } else {
      project.mentors.forEach((m, mIdx) => {
        const mentorName = m.name || `Mentor #${mIdx + 1}`;
        if (!m.linkedIn) {
          errors.push(`Mentor "${mentorName}" is missing their LinkedIn URL.`);
        } else if (!isValidLinkedIn(m.linkedIn)) {
          errors.push(`Mentor "${mentorName}" has an invalid LinkedIn URL: "${m.linkedIn}".`);
        }
      });
    }
  }

  if (errors.length > 0) {
    totalErrors += errors.length;
    results.push({ name: nameLabel, index: projectIndex, errors });
  }
});

/* ==========================================
   Sort Order and Formatting Checks
   ========================================== */

// Check if projects list is sorted
const sortErrors = checkSortOrder(data);
if (sortErrors.length > 0) {
  totalErrors += sortErrors.length;
}

// Check alignment formatting (Must be 2-space indented and normalized newlines)
let formattingError = false;
const normalizedRaw = rawContent.replace(/\r\n/g, '\n');
const normalizedFormatted = (JSON.stringify(data, null, 2) + '\n').replace(/\r\n/g, '\n');
const normalizedFormattedNoTrailing = JSON.stringify(data, null, 2).replace(/\r\n/g, '\n');

if (normalizedRaw !== normalizedFormatted && normalizedRaw !== normalizedFormattedNoTrailing) {
  formattingError = true;
  totalErrors += 1;
}

/* ==========================================
   Outputting the validation report
   ========================================== */

if (totalErrors > 0) {
  console.log(`${RED}✖ Validation Failed! Found ${totalErrors} issue(s) in projects.json:${RESET}\n`);

  // Print project-specific errors
  results.forEach(res => {
    console.log(`${YELLOW}Project #${res.index}: ${res.name}${RESET}`);
    res.errors.forEach(err => {
      console.log(`  - ${err}`);
    });
    console.log();
  });

  // Print sort order errors
  if (sortErrors.length > 0) {
    console.log(`${YELLOW}Sort Order Issues:${RESET}`);
    sortErrors.forEach(err => {
      console.log(`  - ${err}`);
    });
    console.log();
  }

  // Print formatting errors
  if (formattingError) {
    console.log(`${YELLOW}Formatting Issues:${RESET}`);
    console.log(`  - projects.json is not formatted exactly with 2-spaces indentation alignment.`);
    console.log(`    Ensure it matches JSON.stringify(data, null, 2) formatting.`);
    console.log();
  }

  process.exit(1);
} else {
  console.log(`${GREEN}✔ Validation Passed! projects.json is structured correctly, properly sorted, and aligned with 2-space indentation.${RESET}`);
  process.exit(0);
}
