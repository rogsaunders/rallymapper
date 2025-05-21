import React, { createContext, useContext, useState } from "react";

const RallyContext = createContext();

export function RallyProvider({ children }) {
  const [routeInfo, setRouteInfo] = useState({
    date: "",
    name: "",
    startLocation: "",
    endLocation: "",
  });

  const [sections, setSections] = useState([]); // array of { name, startPoint, endPoint, waypoints }
  const [currentSection, setCurrentSection] = useState(null); // current section being edited

  const addSection = (sectionName) => {
    const newSection = {
      name: sectionName,
      startPoint: null,
      endPoint: null,
      waypoints: [],
    };
    setSections([...sections, newSection]);
    setCurrentSection(newSection);
  };

  const setSectionStart = (gps, timestamp) => {
    if (!currentSection) return;
    const updated = { ...currentSection, startPoint: { gps, timestamp } };
    updateSection(updated);
  };

  const setSectionEnd = (gps, timestamp) => {
    if (!currentSection) return;
    const updated = { ...currentSection, endPoint: { gps, timestamp } };
    updateSection(updated);
  };

  const addWaypoint = (waypoint) => {
    if (!currentSection) return;
    const updated = {
      ...currentSection,
      waypoints: [...currentSection.waypoints, waypoint],
    };
    updateSection(updated);
  };

  const updateSection = (updatedSection) => {
    const updatedSections = sections.map((s) =>
      s.name === updatedSection.name ? updatedSection : s
    );
    setSections(updatedSections);
    setCurrentSection(updatedSection);
  };

  return (
    <RallyContext.Provider
      value={{
        routeInfo,
        setRouteInfo,
        sections,
        currentSection,
        addSection,
        setSectionStart,
        setSectionEnd,
        addWaypoint,
      }}
    >
      {children}
    </RallyContext.Provider>
  );
}

export function useRallyContext() {
  return useContext(RallyContext);
}
