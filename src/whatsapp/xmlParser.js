const { parseString } = require('xml2js');
const { promisify } = require('util');
const logger = require('../utils/logger');

const parseXml = promisify(parseString);

class XMLParser {
  /**
   * Parse bounds string like "[0,100][200,300]" to coordinates
   */
  parseBounds(boundsString) {
    const matches = boundsString.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (matches) {
      const [_, left, top, right, bottom] = matches.map(Number);
      return {
        left,
        top,
        right,
        bottom,
        centerX: Math.floor((left + right) / 2),
        centerY: Math.floor((top + bottom) / 2)
      };
    }
    return null;
  }

  /**
   * Recursively search for element in XML node
   */
  findInNode(node, criteria) {
    if (!node) return null;
    
    const attrs = node.$ || {};
    
    // Check resource-id
    if (criteria.resourceId && attrs['resource-id'] === criteria.resourceId) {
      return attrs;
    }
    
    // Check text
    if (criteria.text && attrs.text === criteria.text) {
      return attrs;
    }
    
    // Check content-desc
    if (criteria.contentDesc && attrs['content-desc'] === criteria.contentDesc) {
      return attrs;
    }
    
    // Check contains text
    if (criteria.textContains && attrs.text && attrs.text.includes(criteria.textContains)) {
      return attrs;
    }
    
    // Check children
    if (node.node) {
      for (const child of node.node) {
        const found = this.findInNode(child, criteria);
        if (found) return found;
      }
    }
    
    return null;
  }

  /**
   * Extract all text from node
   */
  extractTextsFromNode(node, texts = []) {
    if (!node) return texts;
    
    const attrs = node.$ || {};
    if (attrs.text && attrs.text.trim()) {
      texts.push(attrs.text);
    }
    
    if (node.node) {
      for (const child of node.node) {
        this.extractTextsFromNode(child, texts);
      }
    }
    
    return texts;
  }

  /**
   * Parse XML string and find element
   */
  async findElement(xmlString, criteria) {
    try {
      const result = await parseXml(xmlString);
      const element = this.findInNode(result.hierarchy.node[0], criteria);
      
      if (element && element.bounds) {
        const coords = this.parseBounds(element.bounds);
        return {
          ...element,
          ...coords
        };
      }
      
      return element;
    } catch (error) {
      logger.error('Error parsing XML:', error);
      throw error;
    }
  }

  /**
   * Extract all texts from XML
   */
  async extractAllTexts(xmlString) {
    try {
      const result = await parseXml(xmlString);
      return this.extractTextsFromNode(result.hierarchy.node[0]);
    } catch (error) {
      logger.error('Error extracting texts:', error);
      throw error;
    }
  }
}

module.exports = new XMLParser();